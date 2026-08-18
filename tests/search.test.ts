import { describe, expect, it, vi } from "vitest";

import { fuzzyProductSearch, searchProducts } from "@/lib/services/search.service";

describe("fuzzyProductSearch", () => {
  it("passes the query and limit through to the similarity query and returns its rows", async () => {
    const rows = [{ id: "product-1", name: "Caltex", sku: "CLX-1", retailPrice: "1000", categoryId: "cat-1" }];
    const queryRaw = vi.fn(async () => rows);

    const result = await fuzzyProductSearch("castrol", 5, queryRaw as never);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(rows);
  });
});

describe("searchProducts", () => {
  it("does not fall back to fuzzy search when the plain search already found results", async () => {
    const fuzzySearch = vi.fn();
    const productLister = {
      findMany: vi.fn(async () => [{ id: "product-1", purchasePrice: "800", retailPrice: "1000" }]),
      count: vi.fn(async () => 1),
    };

    const result = await searchProducts(
      null,
      { q: "zic", page: 1, pageSize: 24 },
      { fuzzySearch, productLister },
    );

    expect(result.usedFuzzyFallback).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(fuzzySearch).not.toHaveBeenCalled();
  });

  it("uses the fuzzy fallback and returns matches in similarity order when the plain search is empty", async () => {
    const fuzzyMatches = [
      { id: "product-2", name: "Caltex", sku: "CLX-1", retailPrice: "1000", categoryId: "cat-1" },
      { id: "product-1", name: "Castrol-like", sku: "CST-1", retailPrice: "1200", categoryId: "cat-1" },
    ];
    const productRows = [
      { id: "product-1", purchasePrice: "800", retailPrice: "1200" },
      { id: "product-2", purchasePrice: "700", retailPrice: "1000" },
    ];

    const fuzzySearch = vi.fn(async () => fuzzyMatches);
    const productLister = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };
    const productFinder = { findMany: vi.fn(async () => productRows) };

    const result = await searchProducts(
      null,
      { q: "castrol", page: 1, pageSize: 24 },
      { fuzzySearch, productFinder, productLister },
    );

    expect(fuzzySearch).toHaveBeenCalledWith("castrol", 24);
    expect(result.usedFuzzyFallback).toBe(true);
    expect(result.items.map((item) => (item as { id: string }).id)).toEqual(["product-2", "product-1"]);
    // Anonymous visitors never see purchasePrice, including through the fuzzy path.
    for (const item of result.items) {
      expect(item).not.toHaveProperty("purchasePrice");
    }
  });

  it("falls back to the plain (empty) result when fuzzy search also finds nothing", async () => {
    const fuzzySearch = vi.fn(async () => []);
    const productLister = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };

    const result = await searchProducts(
      null,
      { q: "xyz-nonexistent", page: 1, pageSize: 24 },
      { fuzzySearch, productLister },
    );

    expect(result.usedFuzzyFallback).toBe(false);
    expect(result.items).toHaveLength(0);
  });
});
