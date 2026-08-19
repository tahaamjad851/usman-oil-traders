"use client";

import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";

import { useCart } from "@/lib/cart/CartContext";

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-shop-ink">Your cart is empty.</p>
        <p className="mt-1 text-sm text-shop-muted">Add some products to get started.</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-shop-red px-5 py-2 text-sm font-medium text-white hover:bg-shop-red/90"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 font-shop-display text-xl uppercase tracking-wide text-shop-ink">Your Cart</h1>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.productId}
            className="flex items-center gap-3 rounded-lg border border-shop-ink/5 bg-shop-card p-3"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-shop-surface">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-1" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/products/${item.slug}`} className="block truncate text-sm font-medium text-shop-ink hover:underline">
                {item.name}
              </Link>
              <p className="font-shop-mono text-sm text-shop-green">Rs {item.unitPrice.toLocaleString()}</p>
              {item.stockStatus === "LOW_STOCK" ? (
                <p className="mt-0.5 text-xs text-shop-amber">Low stock — quantity may be limited.</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                className="rounded border border-shop-ink/10 p-1 text-shop-muted hover:text-shop-ink"
                aria-label={`Decrease quantity of ${item.name}`}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 text-center font-shop-mono text-sm text-shop-ink">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                className="rounded border border-shop-ink/10 p-1 text-shop-muted hover:text-shop-ink"
                aria-label={`Increase quantity of ${item.name}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.productId)}
              className="text-shop-muted hover:text-shop-red"
              aria-label={`Remove ${item.name} from cart`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-lg border border-shop-ink/5 bg-shop-card p-4">
        <div className="flex justify-between text-sm text-shop-muted">
          <span>Website Subtotal</span>
          <span className="font-shop-mono text-shop-ink">Rs {subtotal.toLocaleString()}</span>
        </div>
        <p className="mt-2 text-xs text-shop-amber">
          This is not the final amount. Delivery charges and final pricing will be confirmed with
          you on WhatsApp.
        </p>
      </div>

      <Link
        href="/checkout"
        className="mt-4 block rounded-lg bg-shop-red py-3 text-center font-medium text-white hover:bg-shop-red/90"
      >
        Continue to Checkout
      </Link>
    </div>
  );
}
