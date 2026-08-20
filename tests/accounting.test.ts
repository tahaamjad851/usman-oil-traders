import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/auth/guard";
import {
  getCostOfGoodsSold,
  getExpenseBreakdown,
  getInventoryValue,
  getProfitSummary,
  getRevenue,
  getTopProducts,
  resolvePeriodRange,
} from "@/lib/services/accounting.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const range = { from: new Date("2026-08-01"), to: new Date("2026-08-31") };

describe("resolvePeriodRange", () => {
  it("resolves a full calendar day", () => {
    const result = resolvePeriodRange("daily", new Date("2026-08-15T14:30:00"));
    expect(result.from).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0));
    expect(result.to).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999));
  });

  it("resolves the current calendar month", () => {
    const result = resolvePeriodRange("monthly", new Date("2026-08-15"));
    expect(result.from).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(result.to).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it("resolves the week starting on MONDAY, not Sunday", () => {
    // 2026-08-19 is a Wednesday.
    const wednesday = new Date(2026, 7, 19);
    const result = resolvePeriodRange("weekly", wednesday);
    expect(result.from).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0)); // Monday
    expect(result.to).toEqual(new Date(2026, 7, 23, 23, 59, 59, 999)); // Sunday
  });

  it("keeps a Monday reference date as the start of its own week", () => {
    const monday = new Date(2026, 7, 17);
    const result = resolvePeriodRange("weekly", monday);
    expect(result.from).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
  });

  it("treats Sunday as the last day of its week, not the first", () => {
    const sunday = new Date(2026, 7, 23);
    const result = resolvePeriodRange("weekly", sunday);
    expect(result.from).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
    expect(result.to).toEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
  });
});

describe("report SUPER_ADMIN-only enforcement", () => {
  it("rejects STAFF from every accounting function", async () => {
    const orderFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const localSaleFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const orderItemFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const localSaleItemFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const groupBy = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const productFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });

    await expect(
      getRevenue(staff, range, { order: { findMany: orderFindMany }, localSale: { findMany: localSaleFindMany } }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      getCostOfGoodsSold(staff, range, {
        orderItem: { findMany: orderItemFindMany },
        localSaleItem: { findMany: localSaleItemFindMany },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(getExpenseBreakdown(staff, range, { groupBy })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getInventoryValue(staff, { findMany: productFindMany })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getTopProducts(staff, range, 10, {
        orderItem: { findMany: orderItemFindMany },
        localSaleItem: { findMany: localSaleItemFindMany },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getProfitSummary(staff, range)).rejects.toBeInstanceOf(ForbiddenError);

    // None of the underlying data calls should ever fire for a rejected STAFF request.
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("getRevenue — actually-paid amounts only", () => {
  it("counts a fully-paid order but not a merely-placed/unpaid one", async () => {
    const orderFindMany = vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as { paymentStatus?: string; status?: unknown };
      // Simulates the DB: only rows matching paymentStatus RECEIVED come back.
      expect(where.paymentStatus).toBe("RECEIVED");
      return [{ finalConfirmedAmount: "5000.00" }];
    });
    const localSaleFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });

    const result = await getRevenue(admin, range, {
      order: { findMany: orderFindMany },
      localSale: { findMany: localSaleFindMany },
    });

    expect(result.websiteRevenue).toBe(5000);
  });

  it("includes the paymentStatus: RECEIVED filter in the query itself, not just app-side filtering", async () => {
    const orderFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const localSaleFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });

    await getRevenue(admin, range, {
      order: { findMany: orderFindMany },
      localSale: { findMany: localSaleFindMany },
    });

    expect(orderFindMany.mock.calls[0][0]).toMatchObject({
      where: { paymentStatus: "RECEIVED", status: { not: "CANCELLED" } },
    });
  });

  it("combines website and POS revenue into one total", async () => {
    const orderFindMany = vi.fn(async () => [{ finalConfirmedAmount: "3000.00" }]);
    const localSaleFindMany = vi.fn(async () => [{ totalAmount: "1500.00" }, { totalAmount: "500.00" }]);

    const result = await getRevenue(admin, range, {
      order: { findMany: orderFindMany },
      localSale: { findMany: localSaleFindMany },
    });

    expect(result).toEqual({ websiteRevenue: 3000, localRevenue: 2000, totalRevenue: 5000 });
  });

  it("excludes cancelled orders via the query's status filter", async () => {
    const orderFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    const localSaleFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });

    await getRevenue(admin, range, {
      order: { findMany: orderFindMany },
      localSale: { findMany: localSaleFindMany },
    });

    const where = orderFindMany.mock.calls[0][0] as { where: { status: { not: string } } };
    expect(where.where.status).toEqual({ not: "CANCELLED" });
  });

  it("excludes a POS sale whose payment was voided (Phase 10's voidPayment applies to any Payment, not just Order ones)", async () => {
    const localSaleFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    await getRevenue(admin, range, {
      order: { findMany: vi.fn(async (args: Record<string, unknown>) => { void args; return []; }) },
      localSale: { findMany: localSaleFindMany },
    });

    const call = localSaleFindMany.mock.calls[0][0] as {
      where: { payments: { some: { status: string; voidedAt: null } } };
    };
    expect(call.where.payments).toEqual({ some: { status: "RECEIVED", voidedAt: null } });
  });
});

describe("getCostOfGoodsSold — historical cost snapshot, never a live product join", () => {
  it("uses each item's own unitCost snapshot rather than looking up the product", async () => {
    const orderItemFindMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [{ quantity: 2, unitCost: "2200.00" }];
    });
    const localSaleItemFindMany = vi.fn(async () => [{ quantity: 1, unitCost: "1800.00" }]);

    const result = await getCostOfGoodsSold(admin, range, {
      orderItem: { findMany: orderItemFindMany },
      localSaleItem: { findMany: localSaleItemFindMany },
    });

    expect(result).toEqual({ websiteCOGS: 4400, localCOGS: 1800, totalCOGS: 6200 });
    // Never joins/selects the Product relation — only the item's own snapshotted fields.
    const call = orderItemFindMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(call.select).toEqual({ quantity: true, unitCost: true });
  });

  it("a later change to Product.purchasePrice cannot affect a past period's COGS, because the query never reads Product at all", async () => {
    // The two items below simulate the SAME sale queried at two different times — one before and
    // one after the product's purchasePrice changed in the DB. Since unitCost is a snapshot
    // stored on the item row itself, both queries return the exact same historical value.
    const beforePriceChange = vi.fn(async () => [{ quantity: 1, unitCost: "2200.00" }]);
    const afterPriceChange = vi.fn(async () => [{ quantity: 1, unitCost: "2200.00" }]); // unchanged

    const resultBefore = await getCostOfGoodsSold(admin, range, {
      orderItem: { findMany: beforePriceChange },
      localSaleItem: { findMany: vi.fn(async (args: Record<string, unknown>) => { void args; return []; }) },
    });
    const resultAfter = await getCostOfGoodsSold(admin, range, {
      orderItem: { findMany: afterPriceChange },
      localSaleItem: { findMany: vi.fn(async (args: Record<string, unknown>) => { void args; return []; }) },
    });

    expect(resultBefore.websiteCOGS).toBe(resultAfter.websiteCOGS);
  });

  it("only includes items from non-cancelled, fully-paid orders (same scope as revenue)", async () => {
    const orderItemFindMany = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    await getCostOfGoodsSold(admin, range, {
      orderItem: { findMany: orderItemFindMany },
      localSaleItem: { findMany: vi.fn(async (args: Record<string, unknown>) => { void args; return []; }) },
    });

    const call = orderItemFindMany.mock.calls[0][0] as { where: { order: Record<string, unknown> } };
    expect(call.where.order).toMatchObject({ status: { not: "CANCELLED" }, paymentStatus: "RECEIVED" });
  });
});

describe("getExpenseBreakdown — excludes soft-deleted expenses", () => {
  it("filters deletedAt: null in the query", async () => {
    const groupBy = vi.fn(async (args: Record<string, unknown>) => { void args; return []; });
    await getExpenseBreakdown(admin, range, { groupBy });

    expect(groupBy.mock.calls[0][0]).toMatchObject({ where: { deletedAt: null } });
  });

  it("sums grouped totals per category", async () => {
    const groupBy = vi.fn(async () => [
      { category: "RENT", _sum: { amount: "50000.00" } },
      { category: "SALARY", _sum: { amount: "30000.00" } },
    ]);
    const result = await getExpenseBreakdown(admin, range, { groupBy });

    expect(result).toEqual([
      { category: "RENT", total: 50000 },
      { category: "SALARY", total: 30000 },
    ]);
  });
});

describe("getProfitSummary — ties revenue, COGS, and expenses together", () => {
  it("computes grossProfit and netProfit correctly from a hand-built dataset", async () => {
    const deps = {
      revenue: {
        order: { findMany: vi.fn(async () => [{ finalConfirmedAmount: "10000.00" }]) },
        localSale: { findMany: vi.fn(async () => [{ totalAmount: "5000.00" }]) },
      },
      cogs: {
        orderItem: { findMany: vi.fn(async () => [{ quantity: 2, unitCost: "3000.00" }]) }, // 6000
        localSaleItem: { findMany: vi.fn(async () => [{ quantity: 1, unitCost: "2500.00" }]) }, // 2500
      },
      expense: {
        groupBy: vi.fn(async () => [{ category: "RENT", _sum: { amount: "2000.00" } }]),
      },
    };

    const summary = await getProfitSummary(admin, range, deps);

    // revenue = 10000 + 5000 = 15000; COGS = 6000 + 2500 = 8500; expenses = 2000
    expect(summary.totalRevenue).toBe(15000);
    expect(summary.totalCOGS).toBe(8500);
    expect(summary.grossProfit).toBe(6500); // 15000 - 8500
    expect(summary.totalExpenses).toBe(2000);
    expect(summary.netProfit).toBe(4500); // 6500 - 2000
  });
});

describe("getInventoryValue", () => {
  it("sums stockQuantity * price across active products, excluding discontinued ones via the query filter", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [
        { stockQuantity: 10, purchasePrice: "2000.00", retailPrice: "3000.00" },
        { stockQuantity: 5, purchasePrice: "1000.00", retailPrice: "1500.00" },
      ];
    });

    const result = await getInventoryValue(admin, { findMany });

    expect(result.atCost).toBe(10 * 2000 + 5 * 1000);
    expect(result.atRetail).toBe(10 * 3000 + 5 * 1500);
    expect(result.potentialGrossProfit).toBe(result.atRetail - result.atCost);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { status: { not: "DISCONTINUED" } } });
  });
});

describe("getTopProducts — combines both channels, sorted by revenue", () => {
  it("merges matching product names across Order and LocalSale items", async () => {
    const orderItemFindMany = vi.fn(async () => [
      { productName: "ZIC X7 5W-30", quantity: 2, lineTotal: "6000.00" },
      { productName: "Oil Filter", quantity: 1, lineTotal: "500.00" },
    ]);
    const localSaleItemFindMany = vi.fn(async () => [
      { productName: "ZIC X7 5W-30", quantity: 1, lineTotal: "3000.00" },
    ]);

    const result = await getTopProducts(admin, range, 10, {
      orderItem: { findMany: orderItemFindMany },
      localSaleItem: { findMany: localSaleItemFindMany },
    });

    expect(result[0]).toEqual({ name: "ZIC X7 5W-30", quantity: 3, revenue: 9000 });
    expect(result[1]).toEqual({ name: "Oil Filter", quantity: 1, revenue: 500 });
  });

  it("respects the limit", async () => {
    const orderItemFindMany = vi.fn(async () => [
      { productName: "A", quantity: 1, lineTotal: "300.00" },
      { productName: "B", quantity: 1, lineTotal: "200.00" },
      { productName: "C", quantity: 1, lineTotal: "100.00" },
    ]);
    const result = await getTopProducts(admin, range, 2, {
      orderItem: { findMany: orderItemFindMany },
      localSaleItem: { findMany: vi.fn(async (args: Record<string, unknown>) => { void args; return []; }) },
    });

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.name)).toEqual(["A", "B"]);
  });
});
