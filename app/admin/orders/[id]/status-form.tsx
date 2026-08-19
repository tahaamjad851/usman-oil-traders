"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { orderStatuses } from "@/lib/validation/order.schema";

export function OrderStatusForm({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const response = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, allowNegativeStock }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to update order status.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="max-w-sm space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Status
        <select
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {orderStatuses.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowNegativeStock}
          onChange={(event) => setAllowNegativeStock(event.target.checked)}
        />
        Allow this to take stock negative
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Update status"}
      </button>
    </form>
  );
}
