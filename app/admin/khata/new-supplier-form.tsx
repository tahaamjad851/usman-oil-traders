"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewSupplierForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);

    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        company: data.get("company") || undefined,
        phone: data.get("phone") || undefined,
        address: data.get("address") || undefined,
        notes: data.get("notes") || undefined,
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to add the supplier.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Name
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="name" required />
      </label>
      <label className="block text-sm font-medium">
        Company (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="company" />
      </label>
      <label className="block text-sm font-medium">
        Phone (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="phone" />
      </label>
      <label className="block text-sm font-medium">
        Address (optional)
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="address" />
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
        {isSubmitting ? "Adding…" : "Add supplier"}
      </button>
    </form>
  );
}
