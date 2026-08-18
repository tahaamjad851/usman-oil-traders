import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import {
  createProductSchema,
  updateProductSchema,
  type ProductSearchQuery,
} from "@/lib/validation/product.schema";
import type { AuthContext } from "@/types/auth";

type ProductRecord = Record<string, unknown> & {
  id: string;
  purchasePrice: unknown;
};

// Storefront visitors never see cost, tier pricing they aren't eligible for, or the supplier link.
const PUBLIC_HIDDEN_FIELDS = ["purchasePrice", "mechanicPrice", "wholesalePrice", "supplierId"] as const;
// Staff sell at the prices set for them but must never learn what the shop paid.
const STAFF_HIDDEN_FIELDS = ["purchasePrice"] as const;

function omit<T extends Record<string, unknown>>(record: T, fields: readonly string[]): T {
  const clone: Record<string, unknown> = { ...record };
  for (const field of fields) delete clone[field];
  return clone as T;
}

export function toStaffSafeProduct<T extends ProductRecord>(product: T): T {
  return omit(product, STAFF_HIDDEN_FIELDS);
}

export function toPublicProduct<T extends ProductRecord>(product: T): T {
  return omit(product, PUBLIC_HIDDEN_FIELDS);
}

function shapeProduct<T extends ProductRecord>(ctx: AuthContext | null, product: T): T {
  if (!ctx) return toPublicProduct(product);
  return ctx.role === "SUPER_ADMIN" ? product : toStaffSafeProduct(product);
}

function shapeProducts<T extends ProductRecord>(ctx: AuthContext | null, products: T[]): T[] {
  return products.map((product) => shapeProduct(ctx, product));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const PRODUCT_INCLUDE = { images: true, brand: true, category: true } as const;

type ProductReader = {
  findUniqueOrThrow: (args: { where: { id: string }; include?: unknown }) => Promise<ProductRecord>;
};

export async function getProduct(
  ctx: AuthContext | null,
  productId: string,
  productReader: ProductReader = prisma.product as unknown as ProductReader,
) {
  const product = await productReader.findUniqueOrThrow({
    where: { id: productId },
    include: PRODUCT_INCLUDE,
  });

  return shapeProduct(ctx, product);
}

export function buildProductWhere(
  filters: Pick<ProductSearchQuery, "categoryId" | "brandId" | "viscosity" | "minPrice" | "maxPrice" | "status" | "q">,
  ctx: AuthContext | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...extra };

  // Public storefront only ever sees ACTIVE products regardless of what's requested.
  where.status = !ctx ? "ACTIVE" : filters.status;

  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.viscosity) where.viscosity = filters.viscosity;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.retailPrice = {
      ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
    };
  }
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { sku: { contains: filters.q, mode: "insensitive" } },
      { compatibility: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  return where;
}

export type ProductLister = {
  findMany: (args: Record<string, unknown>) => Promise<ProductRecord[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

export async function listProducts(
  ctx: AuthContext | null,
  filters: ProductSearchQuery,
  productLister: ProductLister = prisma.product as unknown as ProductLister,
) {
  const where = buildProductWhere(filters, ctx);

  const [items, total] = await Promise.all([
    productLister.findMany({
      where,
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, brand: true, category: true },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: { createdAt: "desc" },
    }),
    productLister.count({ where }),
  ]);

  return {
    items: shapeProducts(ctx, items),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ProductWriteClient = {
  product: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string } | null>;
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<ProductRecord>;
    create: (args: { data: Record<string, unknown> }) => Promise<ProductRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ProductRecord>;
  };
  inventoryTransaction: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalClient = ProductWriteClient & {
  $transaction: <T>(fn: (tx: ProductWriteClient) => Promise<T>) => Promise<T>;
};

export async function createProduct(
  ctx: AuthContext,
  input: unknown,
  client: TransactionalClient = prisma as unknown as TransactionalClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createProductSchema.parse(input);

  const existing = await client.product.findUnique({ where: { sku: data.sku } });
  if (existing) {
    throw new ValidationError(`SKU "${data.sku}" already exists.`);
  }

  return client.$transaction(async (tx) => {
    const product = await tx.product.create({ data });

    if (data.stockQuantity && data.stockQuantity > 0) {
      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          type: "MANUAL_ADJUSTMENT",
          quantityDelta: data.stockQuantity,
          resultingQty: data.stockQuantity,
          reason: "INITIAL_STOCK",
          performedById: ctx.userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product.id,
        newValue: data,
        ipAddress: ctx.ip,
      },
    });

    return product;
  });
}

const PRICE_FIELDS = ["purchasePrice", "retailPrice", "mechanicPrice", "wholesalePrice"] as const;

export async function updateProduct(
  ctx: AuthContext,
  productId: string,
  input: unknown,
  client: TransactionalClient = prisma as unknown as TransactionalClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const parsed = updateProductSchema.parse(input);

  // stockQuantity never flows through the edit form — it is only ever changed via the
  // dedicated stock-adjustment path (Phase 3 §6) so every change produces an
  // InventoryTransaction row. Silently dropping it here (rather than rejecting the
  // request) keeps a full-product-object PUT-style client from failing on save.
  const { stockQuantity: _stockQuantity, ...editableData } = parsed;
  void _stockQuantity;

  const before = await client.product.findUniqueOrThrow({ where: { id: productId } });

  return client.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id: productId }, data: editableData });

    const priceFieldsChanged = PRICE_FIELDS.some((field) => field in editableData);

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: priceFieldsChanged ? "PRICE_CHANGED" : "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: productId,
        previousValue: before,
        newValue: editableData,
        ipAddress: ctx.ip,
      },
    });

    return product;
  });
}

type ProductStatusClient = {
  product: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ProductRecord>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export async function discontinueProduct(
  ctx: AuthContext,
  productId: string,
  client: ProductStatusClient = prisma as unknown as ProductStatusClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  // Hard delete is intentionally not exposed: a product referenced by historical
  // Orders/PurchaseItems cannot be deleted without breaking those records. DISCONTINUED
  // hides it from catalog & search while keeping history intact.
  const updated = await client.product.update({
    where: { id: productId },
    data: { status: "DISCONTINUED" },
  });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "PRODUCT_DISCONTINUED",
      entityType: "Product",
      entityId: productId,
      ipAddress: ctx.ip,
    },
  });

  return updated;
}
