"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    const data = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      username: data.get("username"),
      password: data.get("password"),
      redirect: false,
    });

    setIsSubmitting(false);
    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="w-full max-w-sm space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold">Admin login</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Usman Oil Traders staff access
        </p>
      </div>
      <label className="block text-sm font-medium">
        Username
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="username"
          autoComplete="username"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
