"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        "Remove this product? It will be taken off the storefront, but its order history is kept.",
      )
    ) {
      return;
    }
    setPending(true);
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-sm text-destructive hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
