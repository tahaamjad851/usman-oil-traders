"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type SupplierOption = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string };
type LineItem = { productId: string; quantity: string; unitCost: string };

function emptyLine(): LineItem {
  return { productId: "", quantity: "1", unitCost: "" };
}

export function NewPurchaseForm({
  suppliers,
  products,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLine() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);

    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: data.get("supplierId"),
        invoiceNumber: data.get("invoiceNumber") || undefined,
        purchaseDate: data.get("purchaseDate"),
        notes: data.get("notes") || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitCost: item.unitCost,
        })),
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to record the purchase.");
      return;
    }

    form.reset();
    setItems([emptyLine()]);
    router.refresh();
  }

  return (
    <form className="max-w-lg space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Supplier
        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="supplierId" required>
          <option value="">Select a supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="block text-sm font-medium">Line items</span>
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2">
            <label className="block text-xs text-muted-foreground">
              Product
              <select
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={item.productId}
                onChange={(event) => updateItem(index, { productId: event.target.value })}
                required
              >
                <option value="">Select</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Qty
              <input
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(event) => updateItem(index, { quantity: event.target.value })}
                required
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Unit cost
              <input
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="0.00"
                value={item.unitCost}
                onChange={(event) => updateItem(index, { unitCost: event.target.value })}
                required
              />
            </label>
            <button
              type="button"
              onClick={() => removeLine(index)}
              disabled={items.length === 1}
              className="rounded-md border px-2 py-1.5 text-xs text-destructive disabled:opacity-30"
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addLine} className="text-xs text-muted-foreground hover:underline">
          + Add another line
        </button>
      </div>

      <label className="block text-sm font-medium">
        Invoice number (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="invoiceNumber" />
      </label>
      <label className="block text-sm font-medium">
        Purchase date
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="purchaseDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Notes (optional)
        <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="notes" />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Log purchase"}
      </button>
    </form>
  );
}
