import Link from "next/link";

import { CategoryFilterList } from "./CategoryFilterList";

export type CategoryNode = { id: string; name: string; slug: string; children?: CategoryNode[] };
export type BrandNode = { id: string; name: string; slug: string };

type FilterSidebarProps = {
  categories: CategoryNode[];
  brands: BrandNode[];
  activeCategoryId?: string;
  activeBrandId?: string;
  minPrice?: string;
  maxPrice?: string;
  hasActiveFilters: boolean;
};

function FilterContent({
  categories,
  brands,
  activeCategoryId,
  activeBrandId,
  minPrice,
  maxPrice,
  hasActiveFilters,
}: FilterSidebarProps) {
  return (
    <div>
      <div className="mb-5">
        <h3 className="mb-2 text-sm font-medium text-shop-ink">Category</h3>
        <CategoryFilterList categories={categories} activeCategoryId={activeCategoryId} />
      </div>

      <div className="mb-5">
        <h3 className="mb-2 text-sm font-medium text-shop-ink">Brand</h3>
        <ul className="flex flex-wrap gap-1.5">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/products?brand=${brand.id}`}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  activeBrandId === brand.id
                    ? "border-shop-amber text-shop-amber"
                    : "border-shop-ink/10 text-shop-muted hover:border-shop-ink/25"
                }`}
              >
                {brand.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <form action="/products" method="get" className="mb-5">
        <h3 className="mb-2 text-sm font-medium text-shop-ink">Price range (Rs)</h3>
        {activeCategoryId ? <input type="hidden" name="category" value={activeCategoryId} /> : null}
        {activeBrandId ? <input type="hidden" name="brand" value={activeBrandId} /> : null}
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="minPrice">
            Minimum price
          </label>
          <input
            id="minPrice"
            name="minPrice"
            type="number"
            min={0}
            placeholder="Min"
            defaultValue={minPrice}
            className="w-full rounded-md border border-shop-ink/10 bg-shop-bg px-2 py-1.5 text-sm text-shop-ink placeholder:text-shop-muted focus:border-shop-amber focus:outline-none"
          />
          <span className="text-shop-muted" aria-hidden="true">
            –
          </span>
          <label className="sr-only" htmlFor="maxPrice">
            Maximum price
          </label>
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            min={0}
            placeholder="Max"
            defaultValue={maxPrice}
            className="w-full rounded-md border border-shop-ink/10 bg-shop-bg px-2 py-1.5 text-sm text-shop-ink placeholder:text-shop-muted focus:border-shop-amber focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="mt-2 w-full rounded-md border border-shop-ink/10 bg-shop-card px-3 py-1.5 text-xs text-shop-ink transition hover:border-shop-amber"
        >
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <Link href="/products" className="text-xs text-shop-red hover:underline">
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

export function FilterSidebar(props: FilterSidebarProps) {
  return (
    <aside className="mb-6 md:mb-0">
      <details className="rounded-lg border border-shop-ink/5 bg-shop-card p-4 md:hidden">
        <summary className="cursor-pointer font-shop-display text-sm uppercase tracking-wide text-shop-muted">
          Filter
        </summary>
        <div className="mt-3">
          <FilterContent {...props} />
        </div>
      </details>
      <div className="hidden h-fit rounded-lg border border-shop-ink/5 bg-shop-card p-4 md:block">
        <h2 className="mb-3 font-shop-display text-sm uppercase tracking-wide text-shop-muted">Filter</h2>
        <FilterContent {...props} />
      </div>
    </aside>
  );
}
