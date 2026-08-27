import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { recordCustomerPaymentSchema, type CustomerQuery } from "@/lib/validation/customer.schema";
import type { AuthContext } from "@/types/auth";

// Float/Decimal display rounding tolerance — mirrors payment.service.ts's AMOUNT_EPSILON.
const AMOUNT_EPSILON = 0.01;

type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  city: string | null;
  isActive: boolean;
  createdAt: Date;
};

// Minimal fields the balance math actually reads — shared by both the batched multi-customer
// list client (rows carry customerId back, to know which customer each row belongs to) and the
// single-customer write client (already filtered by `where: { customerId }`, so customerId on
// the row itself would be redundant).
type OrderOwedFields = { status: string; websiteSubtotal: unknown; finalConfirmedAmount: unknown };
type SaleOwedFields = { totalAmount: unknown };
type PaymentReceivedFields = { amount: unknown; status: string; voidedAt: unknown };

type LedgerOrderRow = OrderOwedFields & { customerId: string };
type LedgerSaleRow = SaleOwedFields & { customerId: string | null };
type LedgerPaymentRow = PaymentReceivedFields & { customerId: string | null };

// A khata buyer's balance is a running total, not per-order tracking:
//
// owed  = sum(Order, excluding CANCELLED) + sum(LocalSale) tied to the customer
// paid  = sum(non-voided, RECEIVED Payment rows tied to the customer — recordOrderPayment and the
//         POS sale flow both already stamp Payment.customerId directly, so a single `customerId`
//         filter captures order-linked, sale-linked, and khata-only payments alike)
//
// An order's contribution is its finalConfirmedAmount once price has been confirmed; before that,
// the best available figure is its websiteSubtotal — still a real, if provisional, debt. Khata
// bookkeeping starts the moment an order is placed, not once pricing is finalized.
function orderAmountOwed(order: OrderOwedFields): number {
  if (order.status === "CANCELLED") return 0;
  return Number(order.finalConfirmedAmount ?? order.websiteSubtotal);
}

function sumReceivedCustomerPayments(payments: PaymentReceivedFields[]): number {
  return payments
    .filter((payment) => payment.status === "RECEIVED" && !payment.voidedAt)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

type CustomerLedgerClient = {
  customer: {
    findMany: (args: Record<string, unknown>) => Promise<CustomerRecord[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    findUniqueOrThrow: (args: Record<string, unknown>) => Promise<CustomerRecord>;
  };
  order: { findMany: (args: Record<string, unknown>) => Promise<LedgerOrderRow[]> };
  localSale: { findMany: (args: Record<string, unknown>) => Promise<LedgerSaleRow[]> };
  payment: { findMany: (args: Record<string, unknown>) => Promise<LedgerPaymentRow[]> };
};

export async function listCustomersWithBalance(
  ctx: AuthContext,
  filters: CustomerQuery,
  client: CustomerLedgerClient = prisma as unknown as CustomerLedgerClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const [customers, total] = await Promise.all([
    client.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    client.customer.count({ where: { isActive: true } }),
  ]);

  const ids = customers.map((customer) => customer.id);
  const [orders, localSales, payments] = await Promise.all([
    client.order.findMany({ where: { customerId: { in: ids } } }),
    client.localSale.findMany({ where: { customerId: { in: ids } } }),
    client.payment.findMany({ where: { customerId: { in: ids }, status: "RECEIVED", voidedAt: null } }),
  ]);

  const owedByCustomer = new Map<string, number>();
  for (const order of orders) {
    owedByCustomer.set(order.customerId, (owedByCustomer.get(order.customerId) ?? 0) + orderAmountOwed(order));
  }
  for (const sale of localSales) {
    if (!sale.customerId) continue;
    owedByCustomer.set(sale.customerId, (owedByCustomer.get(sale.customerId) ?? 0) + Number(sale.totalAmount));
  }

  const paidByCustomer = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.customerId) continue;
    paidByCustomer.set(payment.customerId, (paidByCustomer.get(payment.customerId) ?? 0) + Number(payment.amount));
  }

  const items = customers.map((customer) => {
    const totalOwed = owedByCustomer.get(customer.id) ?? 0;
    const totalPaid = paidByCustomer.get(customer.id) ?? 0;
    return { ...customer, totalOwed, totalPaid, balance: totalOwed - totalPaid };
  });

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function getCustomerWithHistory(
  ctx: AuthContext,
  customerId: string,
  client: CustomerLedgerClient = prisma as unknown as CustomerLedgerClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const customer = await client.customer.findUniqueOrThrow({ where: { id: customerId } });
  const [orders, localSales, payments] = await Promise.all([
    client.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
    client.localSale.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
    client.payment.findMany({ where: { customerId }, orderBy: { receivedAt: "desc" } }),
  ]);

  const totalOwed =
    orders.reduce((sum, order) => sum + orderAmountOwed(order), 0) +
    localSales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
  const totalPaid = sumReceivedCustomerPayments(payments);

  return { ...customer, orders, localSales, payments, totalOwed, totalPaid, balance: totalOwed - totalPaid };
}

export type CustomerPaymentClient = {
  customer: { findUniqueOrThrow: (args: Record<string, unknown>) => Promise<{ id: string }> };
  order: { findMany: (args: Record<string, unknown>) => Promise<OrderOwedFields[]> };
  localSale: { findMany: (args: Record<string, unknown>) => Promise<SaleOwedFields[]> };
  payment: {
    findMany: (args: Record<string, unknown>) => Promise<PaymentReceivedFields[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string }>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalCustomerPaymentClient = CustomerPaymentClient & {
  $transaction: <T>(fn: (tx: CustomerPaymentClient) => Promise<T>) => Promise<T>;
};

// Recorded straight from the Khata screen — no order/sale is picked, exactly like a real khata
// notebook entry. The Payment row carries customerId only; orderId/localSaleId are left unset.
export async function recordCustomerPayment(
  ctx: AuthContext,
  customerId: string,
  input: unknown,
  client: TransactionalCustomerPaymentClient = prisma as unknown as TransactionalCustomerPaymentClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = recordCustomerPaymentSchema.parse(input);
  const amount = Number(data.amount);

  return client.$transaction(async (tx) => {
    await tx.customer.findUniqueOrThrow({ where: { id: customerId } });

    const [orders, localSales, payments] = await Promise.all([
      tx.order.findMany({ where: { customerId } }),
      tx.localSale.findMany({ where: { customerId } }),
      tx.payment.findMany({ where: { customerId } }),
    ]);

    const totalOwed =
      orders.reduce((sum, order) => sum + orderAmountOwed(order), 0) +
      localSales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    const balance = totalOwed - sumReceivedCustomerPayments(payments);

    if (amount > balance + AMOUNT_EPSILON) {
      throw new ValidationError(
        `Payment of Rs ${amount.toFixed(2)} exceeds the customer's outstanding balance of Rs ${Math.max(balance, 0).toFixed(2)}.`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        customerId,
        amount: data.amount,
        method: data.method,
        transactionReference: data.transactionReference,
        notes: data.notes,
        status: "RECEIVED",
        receivedById: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "KHATA_PAYMENT_RECORDED",
        entityType: "Customer",
        entityId: customerId,
        newValue: { amount: data.amount, method: data.method },
        ipAddress: ctx.ip,
      },
    });

    return payment;
  });
}
