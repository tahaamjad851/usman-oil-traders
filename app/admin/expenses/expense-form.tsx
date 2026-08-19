"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { expenseCategories } from "@/lib/validation/expense.schema";

export function ExpenseForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const receipt = data.get("receipt");

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: data.get("category"),
        amount: data.get("amount"),
        date: data.get("date"),
        description: data.get("description") || undefined,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to record the expense.");
      setIsSubmitting(false);
      return;
    }

    const expense = (await response.json()) as { id: string };

    if (receipt instanceof File && receipt.size > 0) {
      const attachmentData = new FormData();
      attachmentData.set("file", receipt);
      await fetch(`/api/expenses/${expense.id}/attachment`, { method: "POST", body: attachmentData });
    }

    setIsSubmitting(false);
    form.reset();
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Category
        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="category" defaultValue="MISCELLANEOUS">
          {expenseCategories.map((category) => (
            <option key={category} value={category}>
              {category.charAt(0) + category.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Amount
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="amount" placeholder="0.00" required />
      </label>
      <label className="block text-sm font-medium">
        Date
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Description (optional)
        <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="description" />
      </label>
      <label className="block text-sm font-medium">
        Receipt (optional — JPEG, PNG, WebP, or PDF)
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Record expense"}
      </button>
    </form>
  );
}
