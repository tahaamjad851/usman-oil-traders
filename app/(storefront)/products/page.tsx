import type { Metadata } from "next";

import { FilterSidebar, type BrandNode, type CategoryNode } from "@/components/storefront/FilterSidebar";
import { Pagination } from "@/components/storefront/Pagination";
import { ProductCard } from "@/components/storefront/ProductCard";
import { listBrands } from "@/lib/services/brand.service";
import { listCategories } from "@/lib/services/category.service";
import type { StockStatus } from "@/lib/services/product.service";
import { searchProducts } from "@/lib/services/search.service";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = first(params.q);
  return {
    title: q ? `Search results for "${q}"` : "All Products",
    description:
      "Browse genuine engine oils and parts for cars, motorcycles, and tractors — filter by category, brand, or price.",
  };
}

type PublicProductListItem = {
  id: string;
  slug: string;
  name: string;
  retailPrice: string;
  viscosity: string | null;
  size: string | null;
  oilType: string | null;
  stockStatus: StockStatus;
  brand: { name: string } | null;
  images: Array<{ thumbUrl: string | null; url: string }>;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = first(params.q);
  const categoryId = first(params.category);
  const brandId = first(params.brand);
  const minPrice = first(params.minPrice);
  const maxPrice = first(params.maxPrice);
  const page = Number(first(params.page) ?? "1") || 1;

  const [result, categories, brands] = await Promise.all([
    searchProducts(null, {
      q,
      categoryId,
      brandId,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page,
      pageSize: 24,
    }),
    listCategories(),
    listBrands(),
  ]);

  const items = result.items as unknown as PublicProductListItem[];
  const hasActiveFilters = Boolean(q || categoryId || brandId || minPrice || maxPrice);

  function buildHref(targetPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (categoryId) next.set("category", categoryId);
    if (brandId) next.set("brand", brandId);
    if (minPrice) next.set("minPrice", minPrice);
    if (maxPrice) next.set("maxPrice", maxPrice);
    if (targetPage > 1) next.set("page", String(targetPage));
    const qs = next.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-[240px_1fr]">
      <FilterSidebar
        categories={categories as unknown as CategoryNode[]}
        brands={brands as unknown as BrandNode[]}
        activeCategoryId={categoryId}
        activeBrandId={brandId}
        minPrice={minPrice}
        maxPrice={maxPrice}
        hasActiveFilters={hasActiveFilters}
      />

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-shop-display text-xl uppercase tracking-wide text-shop-ink">
            {q ? `Results for "${q}"` : "All Products"}
          </h1>
          <span className="text-sm text-shop-muted">{result.total} products</span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-shop-ink/5 bg-shop-card py-16 text-center">
            <p className="text-shop-ink">No products match these filters.</p>
            <p className="mt-1 text-sm text-shop-muted">
              Try clearing a filter, or search by a different name or SKU.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  slug={product.slug}
                  name={product.name}
                  brandName={product.brand?.name}
                  imageUrl={product.images?.[0]?.thumbUrl ?? product.images?.[0]?.url ?? null}
                  retailPrice={Number(product.retailPrice)}
                  viscosity={product.viscosity}
                  size={product.size}
                  oilType={product.oilType}
                  stockStatus={product.stockStatus}
                />
              ))}
            </div>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} buildHref={buildHref} />
          </>
        )}

        <p className="mt-6 text-xs text-shop-muted">
          Prices shown are indicative — final price and delivery charges are confirmed via WhatsApp.
        </p>
      </div>
    </div>
  );
}
