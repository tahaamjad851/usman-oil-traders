import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listBrands } from "@/lib/services/brand.service";
import { listCategories } from "@/lib/services/category.service";
import { computeStockStatus, listProducts } from "@/lib/services/product.service";

import { flattenCategories } from "./category-options";
import { DeleteProductButton } from "./delete-product-button";
import { ProductForm } from "./product-form";

type CategoryTreeRow = { id: string; name: string; children?: { id: string; name: string }[] };

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  retailPrice: string;
  stockQuantity: number;
  minimumStock: number;
  status: string;
  brand: { name: string } | null;
  category: { name: string } | null;
};

const STOCK_LABEL: Record<string, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
};

const STATUS_LABEL: Record<string, string> = {
  INACTIVE: "Hidden from website",
  DISCONTINUED: "Discontinued",
};

export default async function AdminProductsPage() {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  // requireRole(SUPER_ADMIN) isn't on listProducts itself (it also serves the public catalog),
  // but proxy.ts blocks /admin/products for non-admin roles, and every write below
  // (createProduct/updateProduct) enforces SUPER_ADMIN at the service layer.
  const [result, categoriesTree, brands] = await Promise.all([
    listProducts(ctx, { page: 1, pageSize: 100 }),
    listCategories(),
    listBrands(),
  ]);

  const products = result.items as unknown as ProductRow[];
  const categories = flattenCategories(categoriesTree as unknown as CategoryTreeRow[]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {ctx.username} (SUPER_ADMIN)
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const stockStatus = computeStockStatus(product.stockQuantity, product.minimumStock);
                return (
                  <tr key={product.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{product.sku}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/products/${product.id}`} className="hover:underline">
                        {product.name}
                      </Link>
                      {STATUS_LABEL[product.status] ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({STATUS_LABEL[product.status]})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{product.category?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{product.brand?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      Rs {Number(product.retailPrice).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className={stockStatus === "OUT_OF_STOCK" ? "text-destructive" : undefined}>
                        {STOCK_LABEL[stockStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {product.status !== "DISCONTINUED" ? (
                        <DeleteProductButton productId={product.id} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{result.total} products</p>

      <section>
        <h2 className="mb-2 text-sm font-medium">Add a new product</h2>
        <ProductForm categories={categories} brands={brands as unknown as { id: string; name: string }[]} />
      </section>
    </main>
  );
}
