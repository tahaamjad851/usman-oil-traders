"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function StaffForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);

    const response = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        username: data.get("username"),
        temporaryPassword: data.get("password"),
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to create the staff account.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="max-w-md space-y-3 rounded-md border p-4" onSubmit={onSubmit}>
      <p className="text-xs text-muted-foreground">
        New accounts are always STAFF — SUPER_ADMIN accounts aren&apos;t created here. The staff
        member will be required to change this temporary password on first login.
      </p>
      <label className="block text-sm font-medium">
        Name
        <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="name" required />
      </label>
      <label className="block text-sm font-medium">
        Username
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="username"
          autoComplete="off"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Temporary password
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Creating…" : "Create staff account"}
      </button>
    </form>
  );
}
