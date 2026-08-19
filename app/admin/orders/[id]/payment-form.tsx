"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const METHODS = ["CASH", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER", "OTHER"] as const;

export function PaymentForm({ orderId, remaining }: { orderId: string; remaining: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const response = await fetch(`/api/orders/${orderId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        method,
        transactionReference: method === "CASH" ? undefined : reference || undefined,
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to record the payment.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="mt-3 space-y-2 border-t pt-3" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Amount (remaining: Rs {remaining.toLocaleString()})</span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Method</span>
        <select
          className="w-full rounded-md border bg-background px-3 py-2"
          value={method}
          onChange={(event) => setMethod(event.target.value as (typeof METHODS)[number])}
        >
          {METHODS.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      {method !== "CASH" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Transaction reference (optional)</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
      ) : null}
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
