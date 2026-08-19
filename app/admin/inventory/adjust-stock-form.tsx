"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdjustStockForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const productId = String(data.get("productId"));
    const response = await fetch(`/api/products/${productId}/adjust-stock`, {
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
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Product ID
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="productId" required />
      </label>
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
          <option value="TRANSFER">Transfer</option>
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
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Record adjustment"}
      </button>
    </form>
  );
}
