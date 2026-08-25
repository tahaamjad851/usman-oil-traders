"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffStatusButton({ staffId, isActive }: { staffId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (isActive && !window.confirm("Deactivate this staff account? They will no longer be able to log in.")) {
      return;
    }
    setPending(true);
    await fetch(`/api/admin/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isActive ? "deactivate" : "reactivate" }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        isActive
          ? "text-xs text-destructive hover:underline disabled:opacity-50"
          : "text-xs text-primary hover:underline disabled:opacity-50"
      }
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}
