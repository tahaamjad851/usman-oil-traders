import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { createSupplierSchema, updateSupplierSchema } from "@/lib/validation/supplier.schema";
import { recordSupplierPaymentSchema } from "@/lib/validation/supplier-payment.schema";
import type { AuthContext } from "@/types/auth";

// Float/Decimal display rounding tolerance — mirrors payment.service.ts's AMOUNT_EPSILON.
const AMOUNT_EPSILON = 0.01;

type SupplierRecord = { id: string; name: string };

type SupplierClient = {
  supplier: {
    create: (args: { data: Record<string, unknown> }) => Promise<SupplierRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<SupplierRecord>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

// Suppliers are only ever selected when recording a purchase, and purchases are SUPER_ADMIN-only
// (per the Phase 1 role matrix), so supplier records — including their contact details — are not
// exposed to staff at all.
export async function createSupplier(
  ctx: AuthContext,
  input: unknown,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createSupplierSchema.parse(input);

  const supplier = await client.supplier.create({ data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return supplier;
}

export async function updateSupplier(
  ctx: AuthContext,
  supplierId: string,
  input: unknown,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = updateSupplierSchema.parse(input);

  const supplier = await client.supplier.update({ where: { id: supplierId }, data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "SUPPLIER_UPDATED",
      entityType: "Supplier",
      entityId: supplierId,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return supplier;
}

export async function listSuppliers(
  ctx: AuthContext,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  return client.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

// ---------------------------------------------------------------------------
// Khata: supplier payable balances (money owed to suppliers)
// ---------------------------------------------------------------------------

type SupplierRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
};
// Minimal fields the balance math actually reads, for the batched multi-supplier list — rows
// carry supplierId back so each purchase/payment can be attributed to the right supplier.
type PurchaseOwedRow = { supplierId: string; totalAmount: unknown };
type SupplierPaymentOwedRow = { supplierId: string; amount: unknown };

type SupplierBalanceClient = {
  supplier: { findMany: (args: Record<string, unknown>) => Promise<SupplierRow[]> };
  purchase: { findMany: (args: Record<string, unknown>) => Promise<PurchaseOwedRow[]> };
  supplierPayment: { findMany: (args: Record<string, unknown>) => Promise<SupplierPaymentOwedRow[]> };
};

export async function listSuppliersWithBalance(
  ctx: AuthContext,
  client: SupplierBalanceClient = prisma as unknown as SupplierBalanceClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const suppliers = await client.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const ids = suppliers.map((supplier) => supplier.id);

  const [purchases, payments] = await Promise.all([
    client.purchase.findMany({ where: { supplierId: { in: ids } } }),
    client.supplierPayment.findMany({ where: { supplierId: { in: ids } } }),
  ]);

  const purchasedBySupplier = new Map<string, number>();
  for (const purchase of purchases) {
    purchasedBySupplier.set(
      purchase.supplierId,
      (purchasedBySupplier.get(purchase.supplierId) ?? 0) + Number(purchase.totalAmount),
    );
  }
  const paidBySupplier = new Map<string, number>();
  for (const payment of payments) {
    paidBySupplier.set(payment.supplierId, (paidBySupplier.get(payment.supplierId) ?? 0) + Number(payment.amount));
  }

  return suppliers.map((supplier) => {
    const totalPurchased = purchasedBySupplier.get(supplier.id) ?? 0;
    const totalPaid = paidBySupplier.get(supplier.id) ?? 0;
    return { ...supplier, totalPurchased, totalPaid, balance: totalPurchased - totalPaid };
  });
}

// Fuller rows for the single-supplier detail view — the UI displays purchase date/invoice/status
// and payment date/method, not just the amounts the list view's balance math needs.
type PurchaseDetailRow = {
  id: string;
  supplierId: string;
  purchaseDate: Date;
  invoiceNumber: string | null;
  totalAmount: unknown;
  paymentStatus: string;
};
type SupplierPaymentDetailRow = {
  id: string;
  supplierId: string;
  purchaseId: string | null;
  amount: unknown;
  method: string;
  paidAt: Date;
  notes: string | null;
};

type SupplierDetailClient = {
  supplier: { findUniqueOrThrow: (args: Record<string, unknown>) => Promise<SupplierRow> };
  purchase: { findMany: (args: Record<string, unknown>) => Promise<PurchaseDetailRow[]> };
  supplierPayment: { findMany: (args: Record<string, unknown>) => Promise<SupplierPaymentDetailRow[]> };
};

export async function getSupplierWithBalance(
  ctx: AuthContext,
  supplierId: string,
  client: SupplierDetailClient = prisma as unknown as SupplierDetailClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const supplier = await client.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const [purchases, payments] = await Promise.all([
    client.purchase.findMany({ where: { supplierId }, orderBy: { purchaseDate: "desc" } }),
    client.supplierPayment.findMany({ where: { supplierId }, orderBy: { paidAt: "desc" } }),
  ]);

  const totalPurchased = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return { ...supplier, purchases, payments, totalPurchased, totalPaid, balance: totalPurchased - totalPaid };
}

// ---------------------------------------------------------------------------
// Khata: recording a supplier payment (general, or against one specific purchase)
// ---------------------------------------------------------------------------

export type SupplierPaymentWriteClient = {
  supplier: { findUniqueOrThrow: (args: Record<string, unknown>) => Promise<{ id: string }> };
  purchase: {
    findUniqueOrThrow: (args: Record<string, unknown>) => Promise<{ id: string; supplierId: string; totalAmount: unknown }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  supplierPayment: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string }>;
    findMany: (args: Record<string, unknown>) => Promise<{ amount: unknown }[]>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalSupplierPaymentClient = SupplierPaymentWriteClient & {
  $transaction: <T>(fn: (tx: SupplierPaymentWriteClient) => Promise<T>) => Promise<T>;
};

// purchaseId is optional: a payment can be made in general against a supplier, or against one
// specific purchase — only the latter case recomputes that purchase's paymentStatus.
export async function recordSupplierPayment(
  ctx: AuthContext,
  supplierId: string,
  input: unknown,
  client: TransactionalSupplierPaymentClient = prisma as unknown as TransactionalSupplierPaymentClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = recordSupplierPaymentSchema.parse(input);
  const amount = Number(data.amount);

  return client.$transaction(async (tx) => {
    await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });

    let purchaseTotalAmount = 0;
    let priorPaidForPurchase = 0;

    if (data.purchaseId) {
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: data.purchaseId } });
      if (purchase.supplierId !== supplierId) {
        throw new ValidationError("This purchase does not belong to the selected supplier.");
      }

      const priorPayments = await tx.supplierPayment.findMany({ where: { purchaseId: data.purchaseId } });
      priorPaidForPurchase = priorPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      purchaseTotalAmount = Number(purchase.totalAmount);
      const remaining = purchaseTotalAmount - priorPaidForPurchase;

      if (amount > remaining + AMOUNT_EPSILON) {
        throw new ValidationError(
          `Payment of Rs ${amount.toFixed(2)} exceeds the purchase's remaining balance of Rs ${Math.max(remaining, 0).toFixed(2)}.`,
        );
      }
    }

    const payment = await tx.supplierPayment.create({
      data: {
        supplierId,
        purchaseId: data.purchaseId ?? null,
        amount: data.amount,
        method: data.method,
        notes: data.notes,
      },
    });

    if (data.purchaseId) {
      const newTotalPaid = priorPaidForPurchase + amount;
      const newStatus =
        newTotalPaid <= AMOUNT_EPSILON
          ? "UNPAID"
          : newTotalPaid + AMOUNT_EPSILON >= purchaseTotalAmount
            ? "PAID"
            : "PARTIALLY_PAID";
      await tx.purchase.update({ where: { id: data.purchaseId }, data: { paymentStatus: newStatus } });
    }

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "SUPPLIER_PAYMENT_RECORDED",
        entityType: "Supplier",
        entityId: supplierId,
        newValue: { amount: data.amount, method: data.method, purchaseId: data.purchaseId ?? null },
        ipAddress: ctx.ip,
      },
    });

    return payment;
  });
}
