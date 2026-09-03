"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { CategoryOption } from "../category-options";

type BrandOption = { id: string; name: string };

export function ProductEditForm({
  productId,
  categories,
  brands,
  initial,
}: {
  productId: string;
  categories: CategoryOption[];
  brands: BrandOption[];
  initial: {
    name: string;
    description: string | null;
    categoryId: string;
    brandId: string | null;
    purchasePrice: string;
    retailPrice: string;
    status: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDiscontinued = initial.status === "DISCONTINUED";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    setSuccess(false);

    const data = new FormData(event.currentTarget);
    const brandId = data.get("brandId");
    const description = data.get("description");
    const showOnWebsite = data.get("showOnWebsite") === "on";

    const response = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        categoryId: data.get("categoryId"),
        purchasePrice: data.get("purchasePrice"),
        retailPrice: data.get("retailPrice"),
        brandId: brandId || undefined,
        description: description || undefined,
        // A discontinued product can't be reactivated from here — the checkbox is disabled and
        // excluded from the form, so there is nothing meaningful to send; omitting the key leaves
        // status untouched server-side rather than sending a stale/undefined value.
        ...(isDiscontinued ? {} : { status: showOnWebsite ? "ACTIVE" : "INACTIVE" }),
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to update the product.");
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  return (
    <form className="max-w-lg space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Name
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="name"
          defaultValue={initial.name}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Category
        <select
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="categoryId"
          defaultValue={initial.categoryId}
          required
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Brand (optional)
        <select
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="brandId"
          defaultValue={initial.brandId ?? ""}
        >
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
        <textarea
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="description"
          defaultValue={initial.description ?? ""}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Purchase price
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="purchasePrice"
            defaultValue={initial.purchasePrice}
            placeholder="0.00"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Retail price
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="retailPrice"
            defaultValue={initial.retailPrice}
            placeholder="0.00"
            required
          />
        </label>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="showOnWebsite"
            defaultChecked={initial.status === "ACTIVE"}
            disabled={isDiscontinued}
          />
          Show on website
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          {isDiscontinued
            ? "This product has been discontinued and can't be reactivated from here."
            : "Unchecked products stay in your inventory and stock counts, but won't appear in the storefront catalog or search."}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Stock quantity isn&apos;t editable here — use the{" "}
        <a href="/admin/inventory" className="underline">
          Inventory
        </a>{" "}
        page so every change is tracked as a stock movement.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
