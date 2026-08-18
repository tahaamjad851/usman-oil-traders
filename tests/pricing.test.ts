import { describe, expect, it, vi } from "vitest";

import { resolveCustomerPrice } from "@/lib/services/pricing.service";

const product = {
  id: "product-1",
  retailPrice: "3000.00",
  mechanicPrice: "2800.00",
  wholesalePrice: "2600.00",
};

describe("resolveCustomerPrice", () => {
  it("returns retailPrice for an anonymous storefront visitor", async () => {
    await expect(resolveCustomerPrice(null, product)).resolves.toBe(3000);
  });

  it("returns retailPrice when the customer does not exist", async () => {
    const readers = {
      findCustomer: vi.fn(async () => null),
      findOverride: vi.fn(),
    };
    await expect(resolveCustomerPrice("missing", product, readers)).resolves.toBe(3000);
    expect(readers.findOverride).not.toHaveBeenCalled();
  });

  it("a row-level CustomerPrice override always wins over the tier price", async () => {
    const readers = {
      findCustomer: vi.fn(async () => ({ tier: "MECHANIC" })),
      findOverride: vi.fn(async () => ({ price: "2500.00" })),
    };
    await expect(resolveCustomerPrice("cust-1", product, readers)).resolves.toBe(2500);
  });

  it("resolves the MECHANIC tier price when there is no override", async () => {
    const readers = {
      findCustomer: vi.fn(async () => ({ tier: "MECHANIC" })),
      findOverride: vi.fn(async () => null),
    };
    await expect(resolveCustomerPrice("cust-1", product, readers)).resolves.toBe(2800);
  });

  it("resolves the WHOLESALE tier price when there is no override", async () => {
    const readers = {
      findCustomer: vi.fn(async () => ({ tier: "WHOLESALE" })),
      findOverride: vi.fn(async () => null),
    };
    await expect(resolveCustomerPrice("cust-1", product, readers)).resolves.toBe(2600);
  });

  it("falls back to retailPrice when a tier price is unset on the product", async () => {
    const readers = {
      findCustomer: vi.fn(async () => ({ tier: "MECHANIC" })),
      findOverride: vi.fn(async () => null),
    };
    await expect(
      resolveCustomerPrice("cust-1", { ...product, mechanicPrice: undefined }, readers),
    ).resolves.toBe(3000);
  });

  it("CUSTOM tier with no override falls back to retailPrice", async () => {
    const readers = {
      findCustomer: vi.fn(async () => ({ tier: "CUSTOM" })),
      findOverride: vi.fn(async () => null),
    };
    await expect(resolveCustomerPrice("cust-1", product, readers)).resolves.toBe(3000);
  });
});
