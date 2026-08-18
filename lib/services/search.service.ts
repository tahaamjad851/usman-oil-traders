import "server-only";

import { prisma } from "@/lib/db";
import { listProducts, type ProductLister } from "@/lib/services/product.service";
import type { ProductSearchQuery } from "@/lib/validation/product.schema";
import type { AuthContext } from "@/types/auth";

export type FuzzyProductMatch = {
  id: string;
  name: string;
  sku: string;
  retailPrice: unknown;
  categoryId: string;
};

type QueryRawFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<FuzzyProductMatch[]>;

// pg_trgm-backed typo-tolerant fallback (see the GIN indexes on Product.name / Product.sku /
// Product.compatibility in prisma/schema.prisma). Used only when the plain `contains` search
// in listProducts() comes back empty — cheap to run now, easy to swap for a dedicated search
// service later if the catalog outgrows it.
export async function fuzzyProductSearch(
  query: string,
  limit = 20,
  queryRaw: QueryRawFn = prisma.$queryRaw.bind(prisma) as QueryRawFn,
): Promise<FuzzyProductMatch[]> {
  return queryRaw`
    SELECT id, name, sku, "retailPrice", "categoryId"
    FROM "Product"
    WHERE status = 'ACTIVE'
      AND (similarity(name, ${query}) > 0.2 OR similarity(sku, ${query}) > 0.3)
    ORDER BY GREATEST(similarity(name, ${query}), similarity(sku, ${query})) DESC
    LIMIT ${limit}
  `;
}

type FallbackProductFinder = {
  findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown> & { id: string; purchasePrice: unknown }>>;
};

export async function searchProducts(
  ctx: AuthContext | null,
  filters: ProductSearchQuery,
  deps: {
    fuzzySearch?: typeof fuzzyProductSearch;
    productFinder?: FallbackProductFinder;
    productLister?: ProductLister;
  } = {},
) {
  const primary = await listProducts(ctx, filters, deps.productLister);
  if (!filters.q || primary.items.length > 0) {
    return { ...primary, usedFuzzyFallback: false as const };
  }

  const fuzzySearch = deps.fuzzySearch ?? fuzzyProductSearch;
  const matches = await fuzzySearch(filters.q, filters.pageSize);
  if (matches.length === 0) {
    return { ...primary, usedFuzzyFallback: false as const };
  }

  const productFinder = deps.productFinder ?? (prisma.product as unknown as FallbackProductFinder);
  const ids = matches.map((match) => match.id);
  const products = await productFinder.findMany({
    where: { id: { in: ids }, ...(ctx ? {} : { status: "ACTIVE" }) },
    include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, brand: true, category: true },
  });

  const byId = new Map(products.map((product) => [product.id, product]));
  const ordered = ids.map((id) => byId.get(id)).filter((product): product is NonNullable<typeof product> => Boolean(product));

  const { items } = await listProducts(
    ctx,
    { ...filters, page: 1, pageSize: ordered.length || 1 },
    {
      findMany: async () => ordered,
      count: async () => ordered.length,
    },
  );

  return {
    items,
    total: items.length,
    page: 1,
    pageSize: filters.pageSize,
    usedFuzzyFallback: true as const,
  };
}
