"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to change password.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A new staff account must change its temporary password before use.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Current password
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        New password
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
