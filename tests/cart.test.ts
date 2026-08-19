import { describe, expect, it } from "vitest";

import {
  cartItemCount,
  cartSubtotal,
  mergeCartItem,
  setCartItemQuantity,
  type CartItem,
} from "@/lib/cart/CartContext";

const oil: Omit<CartItem, "quantity"> = {
  productId: "product-1",
  name: "ZIC X7 5W-30",
  slug: "zic-x7-5w-30",
  sku: "ZIC-5W30-1L",
  unitPrice: 3000,
  stockStatus: "IN_STOCK",
};

const filter: Omit<CartItem, "quantity"> = {
  productId: "product-2",
  name: "Oil Filter",
  slug: "oil-filter",
  sku: "OF-001",
  unitPrice: 500,
  stockStatus: "LOW_STOCK",
};

describe("mergeCartItem", () => {
  it("adds a new item with the given quantity", () => {
    const result = mergeCartItem([], oil, 2);
    expect(result).toEqual([{ ...oil, quantity: 2 }]);
  });

  it("increases quantity when the same product is added again", () => {
    const first = mergeCartItem([], oil, 1);
    const second = mergeCartItem(first, oil, 3);
    expect(second).toEqual([{ ...oil, quantity: 4 }]);
  });

  it("keeps other items untouched when adding a different product", () => {
    const cart = mergeCartItem([{ ...oil, quantity: 1 }], filter, 1);
    expect(cart).toHaveLength(2);
    expect(cart.find((item) => item.productId === oil.productId)?.quantity).toBe(1);
  });
});

describe("setCartItemQuantity", () => {
  it("updates the quantity of the matching item", () => {
    const cart = [{ ...oil, quantity: 2 }];
    expect(setCartItemQuantity(cart, oil.productId, 5)).toEqual([{ ...oil, quantity: 5 }]);
  });

  it("removes the item entirely when the quantity drops to zero or below", () => {
    const cart = [{ ...oil, quantity: 2 }];
    expect(setCartItemQuantity(cart, oil.productId, 0)).toEqual([]);
    expect(setCartItemQuantity(cart, oil.productId, -1)).toEqual([]);
  });
});

describe("cartSubtotal / cartItemCount", () => {
  it("sums unitPrice * quantity across all items", () => {
    const cart = [{ ...oil, quantity: 2 }, { ...filter, quantity: 3 }];
    expect(cartSubtotal(cart)).toBe(3000 * 2 + 500 * 3);
  });

  it("sums quantities across all items", () => {
    const cart = [{ ...oil, quantity: 2 }, { ...filter, quantity: 3 }];
    expect(cartItemCount(cart)).toBe(5);
  });

  it("returns 0 for an empty cart", () => {
    expect(cartSubtotal([])).toBe(0);
    expect(cartItemCount([])).toBe(0);
  });
});
