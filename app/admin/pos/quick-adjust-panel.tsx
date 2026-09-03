"use client";

import { FormEvent, useState } from "react";

import { ProductSearch, type SearchResultProduct } from "@/components/admin/ProductSearch";

// A second, more convenient entry point to the same POST /api/products/[id]/adjust-stock route
// app/admin/inventory/adjust-stock-form.tsx already uses — no API/service changes, this just
// saves staff a trip away from the till for the common damage/return case.
export function QuickAdjustPanel() {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SearchResultProduct>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    setOpen(false);
    setSelectedProduct(undefined);
    setError(undefined);
    setSuccess(undefined);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) {
      setError("Search for and select a product first.");
      return;
    }
    setIsSubmitting(true);
    setError(undefined);
    setSuccess(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/products/${selectedProduct.id}/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.get("type"),
        quantityDelta: Number(data.get("quantityDelta")),
        reason: data.get("reason"),
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
    setSuccess("Stock updated.");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm text-muted-foreground hover:underline"
      >
        Report damage / return
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-background p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Report damage / return</h2>
            <button type="button" onClick={close} className="text-xs text-muted-foreground hover:underline">
              Close
            </button>
          </div>
          <form className="space-y-2" onSubmit={onSubmit}>
            <div className="text-xs font-medium">
              Product
              {selectedProduct ? (
                <div className="mt-1 flex items-center justify-between rounded-md border bg-muted/50 px-2 py-1.5 text-sm font-normal">
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
            <label className="block text-xs font-medium">
              Type
              <select
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                name="type"
                defaultValue="DAMAGE"
              >
                <option value="DAMAGE">Damaged</option>
                <option value="RETURN">Return</option>
                <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
              </select>
            </label>
            <label className="block text-xs font-medium">
              Quantity change (negative removes stock)
              <input
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                name="quantityDelta"
                type="number"
                required
              />
            </label>
            <label className="block text-xs font-medium">
              Reason
              <textarea
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                name="reason"
                required
                minLength={3}
              />
            </label>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {success ? <p className="text-xs text-muted-foreground">{success}</p> : null}
            <button
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              disabled={isSubmitting || !selectedProduct}
              type="submit"
            >
              {isSubmitting ? "Saving…" : "Record adjustment"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
