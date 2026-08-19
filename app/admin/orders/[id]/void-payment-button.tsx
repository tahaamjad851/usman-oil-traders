"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleVoid() {
    const reason = window.prompt("Reason for voiding this payment:");
    if (!reason || reason.trim().length < 3) return;

    setPending(true);
    setError(undefined);
    const response = await fetch(`/api/payments/${paymentId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to void this payment.");
      return;
    }

    router.refresh();
  }

  return (
    <span>
      <button
        type="button"
        onClick={handleVoid}
        disabled={pending}
        className="text-xs text-destructive hover:underline disabled:opacity-50"
      >
        Void
      </button>
      {error ? <span className="ml-2 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
