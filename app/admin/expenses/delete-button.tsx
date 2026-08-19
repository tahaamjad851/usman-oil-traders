"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this expense? It stays recorded for audit but drops out of totals.")) {
      return;
    }
    setPending(true);
    await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
