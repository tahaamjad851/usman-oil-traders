"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function RestockForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        items: [
          {
            productId: data.get("productId"),
            quantity: Number(data.get("quantity")),
            unitCost: data.get("unitCost"),
          },
        ],
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to record the restock.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <p className="text-xs text-muted-foreground">
        Records one incoming line item per submission. Supplier and product IDs come from their
        respective records — purchase price is never shown back to non-owner sessions.
      </p>
      <label className="block text-sm font-medium">
        Supplier ID
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="supplierId" required />
      </label>
      <label className="block text-sm font-medium">
        Product ID
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="productId" required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Quantity
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="quantity"
            type="number"
            min={1}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Unit cost
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            name="unitCost"
            placeholder="0.00"
            required
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Purchase date
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="purchaseDate"
          type="date"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Invoice number (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="invoiceNumber" />
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
        {isSubmitting ? "Saving…" : "Record restock"}
      </button>
    </form>
  );
}
