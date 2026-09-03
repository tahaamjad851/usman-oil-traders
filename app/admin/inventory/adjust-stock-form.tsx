"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { ProductSearch, type SearchResultProduct } from "@/components/admin/ProductSearch";

export function AdjustStockForm() {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<SearchResultProduct>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) {
      setError("Search for and select a product first.");
      return;
    }
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/products/${selectedProduct.id}/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.get("type"),
        quantityDelta: Number(data.get("quantityDelta")),
        reason: data.get("reason"),
        allowNegative: data.get("allowNegative") === "on",
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to adjust stock.");
      return;
    }

    form.reset();
    setSelectedProduct(undefined);
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <div className="text-sm font-medium">
        Product
        {selectedProduct ? (
          <div className="mt-1 flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm font-normal">
            <span>
              {selectedProduct.name}{" "}
              <span className="font-mono text-xs text-muted-foreground">({selectedProduct.sku})</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedProduct(undefined)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-1">
            <ProductSearch onSelect={setSelectedProduct} />
          </div>
        )}
      </div>
      <label className="block text-sm font-medium">
        Type
        <select
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="type"
          defaultValue="MANUAL_ADJUSTMENT"
        >
          <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
          <option value="DAMAGE">Damaged</option>
          <option value="RETURN">Return</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Quantity change (negative removes stock)
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="quantityDelta"
          type="number"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Reason
        <textarea
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="reason"
          required
          minLength={3}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="allowNegative" type="checkbox" />
        Allow this to take stock negative
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting || !selectedProduct}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Record adjustment"}
      </button>
    </form>
  );
}
