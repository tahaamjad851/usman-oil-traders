import "server-only";

import { prisma } from "@/lib/db";
import { requireAnyRole, ValidationError } from "@/lib/auth/guard";
import { toStaffSafeProduct } from "@/lib/services/product.service";
import {
  adjustStockSchema,
  type InventoryTransactionQuery,
  type LowStockQuery,
} from "@/lib/validation/inventory.schema";
import type { AuthContext } from "@/types/auth";

// ---------------------------------------------------------------------------
// Manual stock adjustments
// ---------------------------------------------------------------------------

export type StockUpdateClient = {
  product: {
    update: (args: {
      where: { id: string };
      data: { stockQuantity: { increment: number } };
    }) => Promise<{ id: string; stockQuantity: number }>;
  };
  inventoryTransaction: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalStockClient = StockUpdateClient & {
  $transaction: <T>(fn: (tx: StockUpdateClient) => Promise<T>) => Promise<T>;
};

// Both SUPER_ADMIN and STAFF may adjust stock (damaged/lost/miscounted items) — this endpoint
// carries no cost data at all, unlike product creation/editing or purchase entry, which stay
// SUPER_ADMIN-only. The increment happens atomically in the database (rather than a
// read-then-write), so two concurrent adjustments on the same product can't silently clobber
// one another, and the resulting quantity used for the negative-stock check and the ledger row
// is always the true post-update value.
export async function adjustStock(
  ctx: AuthContext,
  productId: string,
  input: unknown,
  client: TransactionalStockClient = prisma as unknown as TransactionalStockClient,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);
  const data = adjustStockSchema.parse(input);

  return client.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: { increment: data.quantityDelta } },
    });

    const wentNegative = updated.stockQuantity < 0;
    if (wentNegative && !data.allowNegative) {
      // Throwing here rolls back the increment above along with the whole transaction.
      throw new ValidationError(
        `This adjustment would take stock to ${updated.stockQuantity}. Pass allowNegative to override.`,
      );
    }
    if (wentNegative) {
      console.warn(
        `[inventory] Stock for product ${productId} went negative (${updated.stockQuantity}) via an explicit override by ${ctx.username}.`,
      );
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        productId,
        type: data.type,
        quantityDelta: data.quantityDelta,
        resultingQty: updated.stockQuantity,
        reason: data.reason,
        performedById: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "STOCK_ADJUSTED",
        entityType: "Product",
        entityId: productId,
        newValue: {
          type: data.type,
          quantityDelta: data.quantityDelta,
          resultingQty: updated.stockQuantity,
          reason: data.reason,
          negativeOverride: wentNegative,
        },
        ipAddress: ctx.ip,
      },
    });

    return { product: updated, transaction };
  });
}

// ---------------------------------------------------------------------------
// Ledger listing (both roles — no cost field exists on InventoryTransaction itself)
// ---------------------------------------------------------------------------

type InventoryTransactionLister = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

export async function listInventoryTransactions(
  ctx: AuthContext,
  filters: InventoryTransactionQuery,
  lister: InventoryTransactionLister = prisma.inventoryTransaction as unknown as InventoryTransactionLister,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);

  const where: Record<string, unknown> = {};
  if (filters.productId) where.productId = filters.productId;
  if (filters.type) where.type = filters.type;

  const [items, total] = await Promise.all([
    lister.findMany({
      where,
      // Deliberately no `include: { purchase: ... }` here: pulling in the related Purchase would
      // be the one way this endpoint could leak PurchaseItem.unitCost to STAFF, so the query only
      // ever selects the ledger row's own fields, who performed it, and which product it affected.
      select: {
        id: true,
        productId: true,
        type: true,
        quantityDelta: true,
        resultingQty: true,
        reason: true,
        performedById: true,
        performedBy: { select: { id: true, name: true, username: true } },
        product: { select: { id: true, name: true, sku: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    lister.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

// ---------------------------------------------------------------------------
// Low-stock report
// ---------------------------------------------------------------------------

// stockQuantity <= minimumStock is a column-to-column comparison, which Prisma's `where` filter
// objects can't express — hence the raw query. Both roles can call this; results are shaped
// through the same toStaffSafeProduct() the catalog uses, so purchasePrice never reaches STAFF.
async function defaultFetchLowStockRows(limit: number, offset: number) {
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT *
    FROM "Product"
    WHERE status != 'DISCONTINUED'
      AND "stockQuantity" <= "minimumStock"
    ORDER BY ("stockQuantity" - "minimumStock") ASC, name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

async function defaultFetchLowStockCount() {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "Product"
    WHERE status != 'DISCONTINUED'
      AND "stockQuantity" <= "minimumStock"
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function getLowStockReport(
  ctx: AuthContext,
  filters: LowStockQuery,
  deps: {
    fetchRows?: (limit: number, offset: number) => Promise<Array<Record<string, unknown>>>;
    fetchCount?: () => Promise<number>;
  } = {},
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);

  const fetchRows = deps.fetchRows ?? defaultFetchLowStockRows;
  const fetchCount = deps.fetchCount ?? defaultFetchLowStockCount;
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, total] = await Promise.all([fetchRows(filters.pageSize, offset), fetchCount()]);

  const items = rows.map((row) =>
    ctx.role === "SUPER_ADMIN" ? row : toStaffSafeProduct(row as { id: string; purchasePrice: unknown }),
  );

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}
