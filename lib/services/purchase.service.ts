import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { createPurchaseSchema, type PurchaseQuery } from "@/lib/validation/purchase.schema";
import type { AuthContext } from "@/types/auth";

type ProductStub = { id: string; name: string; status: string };
type PurchaseItemRecord = { id: string; productId: string; quantity: number };
type PurchaseRecord = { id: string; items: PurchaseItemRecord[] };

export type PurchaseWriteClient = {
  product: {
    findMany: (args: { where: { id: { in: string[] } } }) => Promise<ProductStub[]>;
    update: (args: {
      where: { id: string };
      data: { stockQuantity: { increment: number } };
    }) => Promise<{ id: string; stockQuantity: number }>;
  };
  purchase: {
    create: (args: { data: Record<string, unknown>; include: { items: true } }) => Promise<PurchaseRecord>;
  };
  inventoryTransaction: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalPurchaseClient = PurchaseWriteClient & {
  $transaction: <T>(fn: (tx: PurchaseWriteClient) => Promise<T>) => Promise<T>;
};

// Every incoming-stock line item is snapshotted onto PurchaseItem.unitCost at creation time and
// never recalculated, so a later change to Product.purchasePrice can't retroactively rewrite the
// historical cost of a purchase already on the books.
export async function createPurchase(
  ctx: AuthContext,
  input: unknown,
  client: TransactionalPurchaseClient = prisma as unknown as TransactionalPurchaseClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createPurchaseSchema.parse(input);

  const productIds = data.items.map((item) => item.productId);
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length !== productIds.length) {
    throw new ValidationError(
      "Duplicate product in purchase items — combine quantities into a single line instead.",
    );
  }

  const products = await client.product.findMany({ where: { id: { in: uniqueIds } } });
  if (products.length !== uniqueIds.length) {
    throw new ValidationError("One or more products were not found.");
  }
  const discontinued = products.filter((product) => product.status === "DISCONTINUED");
  if (discontinued.length > 0) {
    throw new ValidationError(
      `Cannot purchase discontinued product(s): ${discontinued.map((product) => product.name).join(", ")}`,
    );
  }

  const totalAmount = data.items
    .reduce((sum, item) => sum + item.quantity * Number(item.unitCost), 0)
    .toFixed(2);

  return client.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        purchaseDate: data.purchaseDate,
        paymentStatus: data.paymentStatus,
        totalAmount,
        notes: data.notes,
        createdById: ctx.userId,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal: (item.quantity * Number(item.unitCost)).toFixed(2),
          })),
        },
      },
      include: { items: true },
    });

    // One transaction covers every line item plus the Purchase row itself: if any increment or
    // ledger write below fails, the whole purchase (and every stock change it caused) rolls back
    // together, so the ledger can never end up out of sync with Product.stockQuantity.
    for (const item of purchase.items) {
      const updated = await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          type: "PURCHASE",
          quantityDelta: item.quantity,
          resultingQty: updated.stockQuantity,
          purchaseId: purchase.id,
          performedById: ctx.userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "PURCHASE_RECORDED",
        entityType: "Purchase",
        entityId: purchase.id,
        newValue: { supplierId: data.supplierId, totalAmount, itemCount: purchase.items.length },
        ipAddress: ctx.ip,
      },
    });

    return purchase;
  });
}

type PurchaseLister = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

export async function listPurchases(
  ctx: AuthContext,
  filters: PurchaseQuery,
  purchaseLister: PurchaseLister = prisma.purchase as unknown as PurchaseLister,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const where: Record<string, unknown> = {};
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;

  const [items, total] = await Promise.all([
    purchaseLister.findMany({
      where,
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { purchaseDate: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    purchaseLister.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

type PurchaseReader = {
  findUniqueOrThrow: (args: Record<string, unknown>) => Promise<unknown>;
};

export async function getPurchase(
  ctx: AuthContext,
  purchaseId: string,
  purchaseReader: PurchaseReader = prisma.purchase as unknown as PurchaseReader,
) {
  requireRole(ctx, "SUPER_ADMIN");
  return purchaseReader.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { supplier: true, items: { include: { product: true } }, supplierPayments: true },
  });
}
