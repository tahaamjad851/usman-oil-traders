"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { CategoryOption } from "./category-options";

type BrandOption = { id: string; name: string };

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProductForm({
  categories,
  brands,
}: {
  categories: CategoryOption[];
  brands: BrandOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const image = data.get("image");
    const brandId = data.get("brandId");
    const description = data.get("description");
    const stockQuantity = data.get("stockQuantity");
    const showOnWebsite = data.get("showOnWebsite") === "on";

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: data.get("sku"),
        name: data.get("name"),
        slug: data.get("slug"),
        categoryId: data.get("categoryId"),
        purchasePrice: data.get("purchasePrice"),
        retailPrice: data.get("retailPrice"),
        status: showOnWebsite ? "ACTIVE" : "INACTIVE",
        ...(brandId ? { brandId } : {}),
        ...(description ? { description } : {}),
        ...(stockQuantity ? { stockQuantity: Number(stockQuantity) } : {}),
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to create the product.");
      setIsSubmitting(false);
      return;
    }

    const product = (await response.json()) as { id: string };

    if (image instanceof File && image.size > 0) {
      const imageData = new FormData();
      imageData.set("file", image);
      await fetch(`/api/products/${product.id}/images`, { method: "POST", body: imageData });
    }

    setIsSubmitting(false);
    form.reset();
    setName("");
    setSlug("");
    setSlugTouched(false);
    router.push(`/admin/products/${product.id}`);
  }

  return (
    <form className="max-w-lg space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        SKU
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="sku" required />
      </label>
      <label className="block text-sm font-medium">
        Name
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="name"
          value={name}
          onChange={(event) => {
            const value = event.target.value;
            setName(value);
            if (!slugTouched) setSlug(slugify(value));
          }}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Slug (used in the product URL)
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="slug"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Category
        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="categoryId" required>
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Brand (optional)
        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="brandId" defaultValue="">
          <option value="">No brand</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Description (optional)
        <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="description" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Purchase price
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="purchasePrice"
            placeholder="0.00"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Retail price
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="retailPrice"
            placeholder="0.00"
            required
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Initial stock
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="stockQuantity"
          type="number"
          min={0}
          defaultValue={0}
        />
      </label>
      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="showOnWebsite" defaultChecked />
          Show on website
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Unchecked products stay in your inventory and stock counts, but won&apos;t appear in the storefront
          catalog or search.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Image (optional — JPEG, PNG, or WebP)
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Create product"}
      </button>
    </form>
  );
}
