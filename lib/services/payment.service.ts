import "server-only";

import { prisma } from "@/lib/db";
import { requireAnyRole, requireRole, ValidationError } from "@/lib/auth/guard";
import {
  recordOrderPaymentSchema,
  voidPaymentSchema,
  type PaymentQuery,
} from "@/lib/validation/payment.schema";
import type { AuthContext } from "@/types/auth";

// Float/Decimal display rounding tolerance — DB math itself stays exact (Decimal columns); this
// only accounts for a client sending e.g. "1999.995" vs the server's own rounding.
const AMOUNT_EPSILON = 0.01;

// ---------------------------------------------------------------------------
// Paid / partially-paid / unpaid derivation
// ---------------------------------------------------------------------------
//
// Order.paymentStatus reuses the existing PaymentStatus enum (PENDING | RECEIVED | FAILED |
// REFUNDED) rather than gaining a new PARTIALLY_PAID value: that enum is shared with Payment.status
// itself, where "partially paid" doesn't make sense for a single atomic payment row — only for an
// order's aggregate. Rather than fork a parallel enum, the paid/partial/unpaid distinction is
// computed here from the payment rows and surfaced to callers as its own value; Order.paymentStatus
// in the database stays binary in practice (PENDING until every rupee is in, RECEIVED once it is).
export type OrderPaymentStatus = "UNCONFIRMED" | "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID";

export type OrderPaymentSummary = {
  confirmedTotal: number | null;
  totalPaid: number;
  remaining: number | null;
  status: OrderPaymentStatus;
};

type SummaryPayment = { amount: unknown; status: string; voidedAt: unknown };

function sumReceivedPayments(payments: SummaryPayment[]): number {
  return payments
    .filter((payment) => payment.status === "RECEIVED" && !payment.voidedAt)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

export function computeOrderPaymentSummary(order: {
  finalConfirmedAmount: unknown;
  payments: SummaryPayment[];
}): OrderPaymentSummary {
  const totalPaid = sumReceivedPayments(order.payments);

  if (order.finalConfirmedAmount === null || order.finalConfirmedAmount === undefined) {
    return { confirmedTotal: null, totalPaid, remaining: null, status: "UNCONFIRMED" };
  }

  const confirmedTotal = Number(order.finalConfirmedAmount);
  const remaining = Math.max(0, confirmedTotal - totalPaid);
  const status: OrderPaymentStatus =
    totalPaid <= 0 ? "UNPAID" : totalPaid + AMOUNT_EPSILON >= confirmedTotal ? "FULLY_PAID" : "PARTIALLY_PAID";

  return { confirmedTotal, totalPaid, remaining, status };
}

// ---------------------------------------------------------------------------
// Recording a payment against a website Order (supports partial payments)
// ---------------------------------------------------------------------------

type OrderForPayment = {
  id: string;
  status: string;
  customerId: string;
  finalConfirmedAmount: unknown;
  payments: SummaryPayment[];
};

export type OrderPaymentClient = {
  order: {
    findUniqueOrThrow: (args: Record<string, unknown>) => Promise<OrderForPayment>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  payment: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string }>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalOrderPaymentClient = OrderPaymentClient & {
  $transaction: <T>(fn: (tx: OrderPaymentClient) => Promise<T>) => Promise<T>;
};

// An order fully paid off while sitting at PRICE_CONFIRMED or PAYMENT_PENDING auto-advances to
// PAYMENT_RECEIVED — staff shouldn't need a redundant manual click just to reflect money that has
// already arrived. It never fires from any other status (NEW/WHATSAPP_CONTACTED can't have a
// payment recorded against them at all — see the finalConfirmedAmount guard below — and
// PROCESSING/SHIPPED/DELIVERED/CANCELLED are left alone so a payment coming in late never walks
// fulfillment progress backward or reanimates a cancelled order).
const AUTO_ADVANCE_TO_PAYMENT_RECEIVED_FROM = ["PRICE_CONFIRMED", "PAYMENT_PENDING"];

export async function recordOrderPayment(
  ctx: AuthContext,
  orderId: string,
  input: unknown,
  client: TransactionalOrderPaymentClient = prisma as unknown as TransactionalOrderPaymentClient,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);
  const data = recordOrderPaymentSchema.parse(input);

  return client.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });

    if (order.status === "CANCELLED") {
      throw new ValidationError("Cannot record a payment against a cancelled order.");
    }

    const summary = computeOrderPaymentSummary(order);
    if (summary.confirmedTotal === null) {
      throw new ValidationError("Confirm the final order amount before recording a payment.");
    }

    const amount = Number(data.amount);
    if (summary.remaining !== null && amount > summary.remaining + AMOUNT_EPSILON) {
      throw new ValidationError(
        `Payment of Rs ${amount.toFixed(2)} exceeds the remaining balance of Rs ${summary.remaining.toFixed(2)}.`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        orderId,
        customerId: order.customerId,
        amount: data.amount,
        method: data.method,
        transactionReference: data.transactionReference,
        notes: data.notes,
        status: "RECEIVED",
        receivedById: ctx.userId,
      },
    });

    const newTotalPaid = summary.totalPaid + amount;
    const nowFullyPaid = newTotalPaid + AMOUNT_EPSILON >= summary.confirmedTotal;

    if (nowFullyPaid) {
      const orderUpdate: Record<string, unknown> = { paymentStatus: "RECEIVED" };
      if (AUTO_ADVANCE_TO_PAYMENT_RECEIVED_FROM.includes(order.status)) {
        orderUpdate.status = "PAYMENT_RECEIVED";
      }
      await tx.order.update({ where: { id: orderId }, data: orderUpdate });
    }

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "PAYMENT_RECORDED",
        entityType: "Order",
        entityId: orderId,
        newValue: { amount: data.amount, method: data.method, totalPaidNow: newTotalPaid.toFixed(2) },
        ipAddress: ctx.ip,
      },
    });

    return payment;
  });
}

// ---------------------------------------------------------------------------
// Voiding a mistaken payment entry (immutable record — void, never delete)
// ---------------------------------------------------------------------------

type VoidablePayment = {
  id: string;
  orderId: string | null;
  status: string;
  voidedAt: Date | null;
};

export type PaymentVoidClient = {
  payment: {
    findUniqueOrThrow: (args: Record<string, unknown>) => Promise<VoidablePayment>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  order: {
    findUnique: (args: Record<string, unknown>) => Promise<OrderForPayment | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalPaymentVoidClient = PaymentVoidClient & {
  $transaction: <T>(fn: (tx: PaymentVoidClient) => Promise<T>) => Promise<T>;
};

// SUPER_ADMIN only — correcting the financial record is a step up in sensitivity from recording
// one, same reasoning as Phase 5/9's "who can adjust vs. who can void/refund" split.
export async function voidPayment(
  ctx: AuthContext,
  paymentId: string,
  input: unknown,
  client: TransactionalPaymentVoidClient = prisma as unknown as TransactionalPaymentVoidClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = voidPaymentSchema.parse(input);

  return client.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.voidedAt) {
      throw new ValidationError("This payment has already been voided.");
    }

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidedById: ctx.userId, voidReason: data.reason },
    });

    // Voiding can only ever make an order LESS paid, never more, so this only ever needs to walk
    // paymentStatus back to PENDING if the order had been marked fully RECEIVED — it never needs
    // to auto-advance anything, and it never touches Order.status/fulfillment stage.
    if (payment.orderId) {
      const order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { payments: true } });
      if (order && order.status !== "CANCELLED") {
        const summary = computeOrderPaymentSummary(order);
        if (summary.status !== "FULLY_PAID") {
          await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "PENDING" } });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "PAYMENT_VOIDED",
        entityType: "Payment",
        entityId: paymentId,
        previousValue: { voidedAt: null },
        newValue: { voidedAt: new Date().toISOString(), reason: data.reason },
        ipAddress: ctx.ip,
      },
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Unified reconciliation view (POS + website order payments) — SUPER_ADMIN only
// ---------------------------------------------------------------------------
//
// Judgment call: STAFF can record payments and see payment status/history for individual orders
// (via getOrder), but an aggregate cross-channel total is exactly the "total revenue today" figure
// the business rules reserve for the owner (same boundary as Phase 12's reporting). Restricted to
// SUPER_ADMIN rather than left ambiguous.
type UnifiedPaymentRow = {
  id: string;
  amount: unknown;
  method: string;
  receivedAt: Date;
  order: { orderNumber: string } | null;
  localSale: { saleNumber: string } | null;
  receivedBy: { name: string } | null;
};

type UnifiedPaymentLister = {
  findMany: (args: Record<string, unknown>) => Promise<UnifiedPaymentRow[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

export async function listUnifiedPayments(
  ctx: AuthContext,
  filters: PaymentQuery,
  lister: UnifiedPaymentLister = prisma.payment as unknown as UnifiedPaymentLister,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const where: Record<string, unknown> = { status: "RECEIVED", voidedAt: null };
  if (filters.method) where.method = filters.method;
  if (filters.from || filters.to) {
    where.receivedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    lister.findMany({
      where,
      // No `product` join anywhere in this query — Payment/Order/LocalSale carry no cost field,
      // so there is no path here that could leak purchasePrice even to the owner-only view.
      include: {
        order: { select: { orderNumber: true } },
        localSale: { select: { saleNumber: true } },
        receivedBy: { select: { name: true } },
      },
      orderBy: { receivedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    lister.count({ where }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    source: row.order ? `Order ${row.order.orderNumber}` : row.localSale ? `Sale ${row.localSale.saleNumber}` : "—",
    amount: row.amount,
    method: row.method,
    receivedBy: row.receivedBy?.name ?? "—",
    receivedAt: row.receivedAt,
  }));

  const totalsByMethod = items.reduce<Record<string, number>>((totals, item) => {
    totals[item.method] = (totals[item.method] ?? 0) + Number(item.amount);
    return totals;
  }, {});
  const grandTotal = items.reduce((sum, item) => sum + Number(item.amount), 0);

  return { items, total, page: filters.page, pageSize: filters.pageSize, totalsByMethod, grandTotal };
}
