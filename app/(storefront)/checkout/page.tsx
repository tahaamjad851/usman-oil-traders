"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

import { useCart } from "@/lib/cart/CartContext";

type PlacedOrderSummary = {
  orderNumber: string;
  websiteSubtotal: string;
  items: Array<{ productName: string; quantity: number; lineTotal: string }>;
};

const inputClass =
  "w-full rounded-md border border-shop-ink/10 bg-shop-card px-3 py-2 text-sm text-shop-ink focus:border-shop-amber focus:outline-none";

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerNotes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrderSummary | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setErrors({ general: body.error ?? "Something went wrong. Please try again." });
      setSubmitting(false);
      return;
    }

    const order = (await response.json()) as PlacedOrderSummary;
    setPlacedOrder(order);
    clear();
    setSubmitting(false);
  }

  // Order numbers are sequential (UOT-10001, UOT-10002, …) and there are no customer accounts, so
  // a shareable /order/[orderNumber] URL would let anyone guess a nearby number and see a
  // stranger's name, phone, and address. The confirmation is shown in place instead, using the
  // data already returned from this submission — no separate lookup-by-number endpoint exists.
  if (placedOrder) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-shop-green/10 text-xl text-shop-green">
          ✓
        </div>
        <h1 className="font-shop-display text-xl uppercase tracking-wide text-shop-ink">Order Placed</h1>
        <p className="mt-1 font-shop-mono text-shop-amber">{placedOrder.orderNumber}</p>

        <div className="mt-6 rounded-lg border border-shop-ink/5 bg-shop-card p-4 text-left text-sm">
          <ul className="space-y-1">
            {placedOrder.items.map((item) => (
              <li key={item.productName} className="flex justify-between gap-2 text-shop-muted">
                <span className="truncate">
                  {item.productName} × {item.quantity}
                </span>
                <span className="shrink-0 font-shop-mono text-shop-ink">
                  Rs {Number(item.lineTotal).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-shop-ink/10 pt-3 text-shop-muted">
            <span>Subtotal</span>
            <span className="font-shop-mono text-shop-ink">
              Rs {Number(placedOrder.websiteSubtotal).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-xs text-shop-amber">
            This is not your final amount — we&apos;ll confirm final pricing and delivery charges
            with you on WhatsApp.
          </p>
        </div>

        <p className="mt-6 text-sm text-shop-muted">
          Thanks! We&apos;ll contact you on WhatsApp shortly to confirm your order.
        </p>
        <Link href="/products" className="mt-4 inline-block text-sm text-shop-red hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-shop-ink">Your cart is empty.</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-shop-red px-5 py-2 text-sm font-medium text-white"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-1 font-shop-display text-xl uppercase tracking-wide text-shop-ink">Your Details</h1>
      <p className="mb-6 text-sm text-shop-muted">
        We&apos;ll use this to confirm your order on WhatsApp.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <input
            required
            value={form.customerName}
            onChange={(event) => setForm({ ...form, customerName: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="WhatsApp / phone number">
          <input
            required
            placeholder="03XXXXXXXXX"
            value={form.customerPhone}
            onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Delivery address (optional — you can also pick up in person)">
          <textarea
            rows={3}
            value={form.customerAddress}
            onChange={(event) => setForm({ ...form, customerAddress: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            rows={2}
            value={form.customerNotes}
            onChange={(event) => setForm({ ...form, customerNotes: event.target.value })}
            className={inputClass}
          />
        </Field>

        {errors.general ? <p className="text-sm text-shop-red">{errors.general}</p> : null}

        <div className="rounded-lg border border-shop-ink/5 bg-shop-card p-3 text-sm">
          <div className="flex justify-between text-shop-muted">
            <span>Website Subtotal</span>
            <span className="font-shop-mono text-shop-ink">Rs {subtotal.toLocaleString()}</span>
          </div>
          <p className="mt-2 text-xs text-shop-amber">
            Final price and delivery charges will be confirmed through WhatsApp after you place
            this order.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-shop-red py-3 font-medium text-white hover:bg-shop-red/90 disabled:opacity-60"
        >
          {submitting ? "Placing order…" : "Place Order"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-shop-muted">{label}</span>
      {children}
    </label>
  );
}
