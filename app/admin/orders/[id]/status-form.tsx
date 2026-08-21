"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { orderStatuses } from "@/lib/validation/order.schema";

export function OrderStatusForm({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [finalProductAmount, setFinalProductAmount] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const response = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        allowNegativeStock,
        // Only sent when the staff member actually typed something — omitting these three lets
        // a plain status change (e.g. NEW -> WHATSAPP_CONTACTED) go through without accidentally
        // touching finalConfirmedAmount, matching the API's own `.optional()` schema fields.
        ...(finalProductAmount ? { finalProductAmount } : {}),
        ...(deliveryCharge ? { deliveryCharge } : {}),
        ...(discount ? { discount } : {}),
      }),
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

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm font-medium">
          Final product amount
          <input
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
            value={finalProductAmount}
            onChange={(event) => setFinalProductAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="block text-sm font-medium">
          Delivery charge
          <input
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
            value={deliveryCharge}
            onChange={(event) => setDeliveryCharge(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="block text-sm font-medium">
          Discount
          <input
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Fill these in (final product amount is usually the negotiated price) and update status to
        confirm the order&apos;s final amount — this unlocks payment recording below.
      </p>

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
