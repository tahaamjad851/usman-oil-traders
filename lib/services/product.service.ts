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
// Exact counts are an operational detail, not customer-facing information — the public site
// only ever shows a derived status (see computeStockStatus / toPublicProduct below).
const PUBLIC_HIDDEN_STOCK_FIELDS = ["stockQuantity", "minimumStock"] as const;
// Staff sell at the prices set for them but must never learn what the shop paid.
const STAFF_HIDDEN_FIELDS = ["purchasePrice"] as const;

function omit<T extends Record<string, unknown>>(record: T, fields: readonly string[]): T {
  const clone: Record<string, unknown> = { ...record };
  for (const field of fields) delete clone[field];
  return clone as T;
}

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function computeStockStatus(stockQuantity: number, minimumStock: number): StockStatus {
  if (stockQuantity <= 0) return "OUT_OF_STOCK";
  if (stockQuantity <= minimumStock) return "LOW_STOCK";
  return "IN_STOCK";
}

export function toStaffSafeProduct<T extends ProductRecord>(product: T): T {
  return omit(product, STAFF_HIDDEN_FIELDS);
}

export function toPublicProduct<T extends ProductRecord & { stockQuantity: number; minimumStock: number }>(
  product: T,
) {
  const stockStatus = computeStockStatus(Number(product.stockQuantity), Number(product.minimumStock));
  const withoutHiddenFields = omit(omit(product, PUBLIC_HIDDEN_FIELDS), PUBLIC_HIDDEN_STOCK_FIELDS);
  return { ...withoutHiddenFields, stockStatus };
}

function shapeProduct<T extends ProductRecord>(ctx: AuthContext | null, product: T) {
  // Every real caller reads full Product rows (stockQuantity/minimumStock are non-nullable
  // columns), so this bridges the gap between that runtime guarantee and the looser ProductRecord
  // constraint kept on the reader/lister types above for backward compatibility with existing
  // test doubles that don't need those fields (they only ever exercise the staff/admin path).
  if (!ctx) return toPublicProduct(product as T & { stockQuantity: number; minimumStock: number });
  return ctx.role === "SUPER_ADMIN" ? product : toStaffSafeProduct(product);
}

function shapeProducts<T extends ProductRecord>(ctx: AuthContext | null, products: T[]) {
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

type SlugProductReader = {
  findUnique: (args: { where: { slug: string }; include?: unknown }) => Promise<ProductRecord | null>;
};

// The public product detail page routes by slug, not id — unlike getProduct(), a missing slug is
// an expected, common case (bad link, stale bookmark) so this returns null instead of throwing,
// letting the page call notFound() and render a normal 404 rather than an unhandled error.
export async function getProductBySlug(
  ctx: AuthContext | null,
  slug: string,
  productReader: SlugProductReader = prisma.product as unknown as SlugProductReader,
) {
  const product = await productReader.findUnique({
    where: { slug },
    include: PRODUCT_INCLUDE,
  });

  if (!product) return null;
  // Matches listProducts()/buildProductWhere(): the public catalog only ever shows ACTIVE
  // products, so a DISCONTINUED or INACTIVE product's detail page 404s for anonymous visitors
  // (an authenticated admin/staff caller can still open it — the type of `product.status` is
  // known at runtime even though the loose ProductRecord type doesn't declare it).
  if (!ctx && (product as { status?: string }).status !== "ACTIVE") return null;
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
  // Admin-only capability (e.g. the full stock list's "lowest stock first" default) — not part of
  // ProductSearchQuery/the public search API, so it can't be driven by a public query string.
  orderBy: Record<string, "asc" | "desc"> = { createdAt: "desc" },
) {
  const where = buildProductWhere(filters, ctx);

  const [items, total] = await Promise.all([
    productLister.findMany({
      where,
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, brand: true, category: true },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy,
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
