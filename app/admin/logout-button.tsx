"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="rounded-md border px-3 py-2 text-sm"
      onClick={() => signOut({ callbackUrl: "/admin/login" })}
      type="button"
    >
      Sign out
    </button>
  );
}
