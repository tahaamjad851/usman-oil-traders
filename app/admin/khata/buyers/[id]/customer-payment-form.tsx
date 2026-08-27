"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { paymentMethods } from "@/lib/validation/payment.schema";

export function CustomerPaymentForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);

    const response = await fetch(`/api/customers/${customerId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: data.get("amount"),
        method: data.get("method"),
        transactionReference: data.get("transactionReference") || undefined,
        notes: data.get("notes") || undefined,
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to record the payment.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Amount
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="amount"
          placeholder="0.00"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Method
        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="method" defaultValue="CASH">
          {paymentMethods.map((method) => (
            <option key={method} value={method}>
              {method.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Transaction reference (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="transactionReference" />
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
        {isSubmitting ? "Saving…" : "Record payment"}
      </button>
    </form>
  );
}
