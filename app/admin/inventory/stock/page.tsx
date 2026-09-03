import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { computeStockStatus, listProducts } from "@/lib/services/product.service";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  minimumStock: number;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Hidden from website",
  DISCONTINUED: "Discontinued",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryStockListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const params = await searchParams;
  const q = first(params.q);

  // Lowest stock first by default — matches how the owner actually uses this page: checking
  // what's running low or looks wrong, not browsing the catalog top-to-bottom.
  const result = await listProducts(ctx, { q, page: 1, pageSize: 100 }, undefined, { stockQuantity: "asc" });
  const products = result.items as unknown as ProductRow[];

  // /admin/products/[id] is SUPER_ADMIN-only (proxy.ts) — STAFF can use this page (same access as
  // the rest of Inventory) but the drill-in link would just bounce them back to /admin, so it's
  // only rendered as a link for SUPER_ADMIN.
  const canOpenProduct = ctx.role === "SUPER_ADMIN";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">
          ← Inventory
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Stock list</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every product&apos;s current stock, lowest first.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="block">
          <span className="mb-1 block text-muted-foreground">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Name or SKU…"
            className="rounded border bg-background px-2 py-1.5"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Search
        </button>
        {q ? (
          <Link href="/admin/inventory/stock" className="text-xs text-muted-foreground hover:underline">
            Clear
          </Link>
        ) : null}
      </form>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products match this search.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Minimum</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const stockStatus = computeStockStatus(product.stockQuantity, product.minimumStock);
                return (
                  <tr key={product.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">
                      {canOpenProduct ? (
                        <Link href={`/admin/products/${product.id}`} className="hover:underline">
                          {product.sku}
                        </Link>
                      ) : (
                        product.sku
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canOpenProduct ? (
                        <Link href={`/admin/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        product.name
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={stockStatus === "OUT_OF_STOCK" ? "text-destructive" : undefined}>
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{product.minimumStock}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {STATUS_LABEL[product.status] ?? product.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {result.total} products{q ? ` matching "${q}"` : ""}
      </p>
    </main>
  );
}
