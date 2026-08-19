"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { StockStatus } from "@/lib/services/product.service";

export type CartItem = {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  imageUrl?: string | null;
  // Display-only cache of the price/stock status at the moment the item was added — the server
  // re-validates both from the database at order creation and never trusts these.
  unitPrice: number;
  stockStatus: StockStatus;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  subtotal: number;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "uot_cart_v1";

// Pure helpers, deliberately free of any DOM/React dependency so they're unit-testable without a
// browser or jsdom environment — the CartProvider component below is a thin, untested wrapper
// around these.
export function mergeCartItem(
  items: CartItem[],
  item: Omit<CartItem, "quantity">,
  quantity: number,
): CartItem[] {
  const existing = items.find((candidate) => candidate.productId === item.productId);
  if (existing) {
    return items.map((candidate) =>
      candidate.productId === item.productId
        ? { ...candidate, ...item, quantity: candidate.quantity + quantity }
        : candidate,
    );
  }
  return [...items, { ...item, quantity }];
}

export function setCartItemQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((item) => item.productId !== productId);
  return items.map((item) => (item.productId === productId ? { ...item, quantity } : item));
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount. This has to be an effect rather than a useState
  // lazy initializer: localStorage doesn't exist during SSR, so reading it has to be deferred
  // until after the client has mounted, which is exactly what an effect is for here (syncing
  // React state with an external store) even though the linter's default heuristic flags any
  // setState-in-effect.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setItems(JSON.parse(stored) as CartItem[]);
    } catch {
      // Corrupted storage — start with an empty cart rather than crash the page.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1) {
    setItems((prev) => mergeCartItem(prev, item, quantity));
  }

  function updateQuantity(productId: string, quantity: number) {
    setItems((prev) => setCartItemQuantity(prev, productId, quantity));
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }

  function clear() {
    setItems([]);
  }

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        clear,
        subtotal: cartSubtotal(items),
        itemCount: cartItemCount(items),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
