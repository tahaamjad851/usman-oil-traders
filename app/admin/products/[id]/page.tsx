import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listBrands } from "@/lib/services/brand.service";
import { listCategories } from "@/lib/services/category.service";
import { getProduct } from "@/lib/services/product.service";

import { flattenCategories } from "../category-options";
import { ProductEditForm } from "./product-edit-form";
import { ProductImages } from "./product-images";

type CategoryTreeRow = { id: string; name: string; children?: { id: string; name: string }[] };

type ProductDetail = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  purchasePrice: string;
  retailPrice: string;
  stockQuantity: number;
  minimumStock: number;
  status: string;
  images: { id: string; url: string; thumbUrl: string | null }[];
};

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const [product, categoriesTree, brands] = await Promise.all([
    getProduct(ctx, id) as Promise<ProductDetail>,
    listCategories(),
    listBrands(),
  ]);
  const categories = flattenCategories(categoriesTree as unknown as CategoryTreeRow[]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{product.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          SKU {product.sku} · Slug {product.slug} · Status {product.status} · Stock{" "}
          {product.stockQuantity} (min {product.minimumStock})
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium">Images</h2>
        <ProductImages productId={product.id} images={product.images} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Edit product</h2>
        <ProductEditForm
          productId={product.id}
          categories={categories}
          brands={brands as unknown as { id: string; name: string }[]}
          initial={{
            name: product.name,
            description: product.description,
            categoryId: product.categoryId,
            brandId: product.brandId,
            purchasePrice: product.purchasePrice,
            retailPrice: product.retailPrice,
            status: product.status,
          }}
        />
      </section>
    </main>
  );
}
