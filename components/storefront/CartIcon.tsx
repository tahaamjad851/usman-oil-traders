"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { useCart } from "@/lib/cart/CartContext";

export function CartIcon() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/cart"
      className="relative flex shrink-0 items-center rounded-full p-2 text-shop-ink transition hover:bg-shop-ink/5"
      aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      {itemCount > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-shop-red px-1 text-[10px] font-medium text-white"
          aria-hidden="true"
        >
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
