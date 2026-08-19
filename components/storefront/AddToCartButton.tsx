"use client";

import { useState } from "react";

import { useCart } from "@/lib/cart/CartContext";
import type { StockStatus } from "@/lib/services/product.service";

type AddToCartButtonProps = {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  imageUrl?: string | null;
  unitPrice: number;
  stockStatus: StockStatus;
};

export function AddToCartButton(product: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // OUT_OF_STOCK is a hard block — no quantity can be added. LOW_STOCK only warns; the exact
  // remaining count isn't known client-side (Phase 6 deliberately never sends it to the public
  // site), so the authoritative check happens server-side when the order is actually placed.
  const isOutOfStock = product.stockStatus === "OUT_OF_STOCK";

  function handleAdd() {
    addItem(
      {
        productId: product.productId,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        imageUrl: product.imageUrl,
        unitPrice: product.unitPrice,
        stockStatus: product.stockStatus,
      },
      quantity,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div>
      {product.stockStatus === "LOW_STOCK" ? (
        <p className="mb-2 text-xs text-shop-amber">
          Only a few left — quantity will be confirmed with you on WhatsApp.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="quantity">
          Quantity
        </label>
        <input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          disabled={isOutOfStock}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          className="w-16 rounded-md border border-shop-ink/10 bg-shop-card px-2 py-2.5 text-center text-sm text-shop-ink disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isOutOfStock}
          className="flex-1 rounded-full bg-shop-red py-2.5 text-sm font-medium text-white transition hover:bg-shop-red/90 disabled:cursor-not-allowed disabled:bg-shop-ink/10 disabled:text-shop-muted"
        >
          {isOutOfStock ? "Out of Stock" : added ? "Added ✓" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
