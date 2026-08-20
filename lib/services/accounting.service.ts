import "server-only";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guard";
import type { AuthContext } from "@/types/auth";

export type DateRange = { from: Date; to: Date };
export type Period = "daily" | "weekly" | "monthly";

// Every function below requireRole(ctx, "SUPER_ADMIN") — this is the phase that finally computes
// profit, the entire reason purchasePrice/cost has been restricted to the owner since Phase 4.
// There is no partial or redacted STAFF view of any of it.

// ---------------------------------------------------------------------------
// Period resolution
// ---------------------------------------------------------------------------
//
// Implemented with plain Date arithmetic rather than adding date-fns as a new dependency — this
// project doesn't otherwise use it, and day/week/month boundaries for one locale don't need a
// library. Week starts on MONDAY (Pakistan's business-week convention), not JS's Sunday-based
// Date.getDay() default — flagged explicitly since it's exactly the kind of thing that goes wrong
// silently and produces a plausible-looking but incorrect report.
export function resolvePeriodRange(period: Period, referenceDate: Date = new Date()): DateRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const date = referenceDate.getDate();

  switch (period) {
    case "daily": {
      return {
        from: new Date(year, month, date, 0, 0, 0, 0),
        to: new Date(year, month, date, 23, 59, 59, 999),
      };
    }
    case "weekly": {
      const dayOfWeek = referenceDate.getDay(); // 0 = Sunday .. 6 = Saturday
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const from = new Date(year, month, date - daysSinceMonday, 0, 0, 0, 0);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
      return { from, to };
    }
    case "monthly": {
      return {
        from: new Date(year, month, 1, 0, 0, 0, 0),
        // Day 0 of next month = last day of this month.
        to: new Date(year, month + 1, 0, 23, 59, 59, 999),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Revenue — actually-paid amounts only, never merely-placed orders
// ---------------------------------------------------------------------------
//
// Website revenue counts an order's finalConfirmedAmount only when paymentStatus is RECEIVED
// (Phase 10's binary "fully paid" flag) — an order that's PENDING or only partially paid
// contributes nothing yet. POS sales (Phase 9) are always fully paid at the moment of sale, so
// every non-... LocalSale in range counts. Both are dated by their own createdAt (order placed /
// sale rung up), which is also COGS's date dimension below, so revenue and COGS for the same
// period describe the same underlying set of transactions.
export type RevenueBreakdown = { websiteRevenue: number; localRevenue: number; totalRevenue: number };

type RevenueOrderRow = { finalConfirmedAmount: unknown };
type RevenueLocalSaleRow = { totalAmount: unknown };

type RevenueClient = {
  order: { findMany: (args: Record<string, unknown>) => Promise<RevenueOrderRow[]> };
  localSale: { findMany: (args: Record<string, unknown>) => Promise<RevenueLocalSaleRow[]> };
};

export async function getRevenue(
  ctx: AuthContext,
  range: DateRange,
  client: RevenueClient = prisma as unknown as RevenueClient,
): Promise<RevenueBreakdown> {
  requireRole(ctx, "SUPER_ADMIN");

  const [orders, localSales] = await Promise.all([
    client.order.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        status: { not: "CANCELLED" },
        paymentStatus: "RECEIVED",
      },
      select: { finalConfirmedAmount: true },
    }),
    // A POS sale's payment can be voided too (Phase 10's voidPayment works on any Payment, not
    // just order ones) — LocalSale itself has no paymentStatus field, so unlike Order this has to
    // check the payment relation directly rather than a status column on the sale row.
    client.localSale.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        payments: { some: { status: "RECEIVED", voidedAt: null } },
      },
      select: { totalAmount: true },
    }),
  ]);

  const websiteRevenue = orders.reduce((sum, order) => sum + Number(order.finalConfirmedAmount ?? 0), 0);
  const localRevenue = localSales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);

  return { websiteRevenue, localRevenue, totalRevenue: websiteRevenue + localRevenue };
}

// ---------------------------------------------------------------------------
// Cost of goods sold — uses the unitCost snapshot (see order.service.ts / local-sale.service.ts),
// never a live join to the current Product.purchasePrice
// ---------------------------------------------------------------------------

export type CogsBreakdown = { websiteCOGS: number; localCOGS: number; totalCOGS: number };

type CostItemRow = { quantity: number; unitCost: unknown };

type CogsClient = {
  orderItem: { findMany: (args: Record<string, unknown>) => Promise<CostItemRow[]> };
  localSaleItem: { findMany: (args: Record<string, unknown>) => Promise<CostItemRow[]> };
};

export async function getCostOfGoodsSold(
  ctx: AuthContext,
  range: DateRange,
  client: CogsClient = prisma as unknown as CogsClient,
): Promise<CogsBreakdown> {
  requireRole(ctx, "SUPER_ADMIN");

  const [orderItems, localSaleItems] = await Promise.all([
    // Same scope as getRevenue's website side: only items belonging to a non-cancelled, fully
    // paid order count — an unpaid order's items haven't been "sold" for accounting purposes yet.
    client.orderItem.findMany({
      where: {
        order: { createdAt: { gte: range.from, lte: range.to }, status: { not: "CANCELLED" }, paymentStatus: "RECEIVED" },
      },
      select: { quantity: true, unitCost: true },
    }),
    // Same voided-payment exclusion as getRevenue's local-sale side.
    client.localSaleItem.findMany({
      where: {
        localSale: {
          createdAt: { gte: range.from, lte: range.to },
          payments: { some: { status: "RECEIVED", voidedAt: null } },
        },
      },
      select: { quantity: true, unitCost: true },
    }),
  ]);

  const sumCost = (items: CostItemRow[]) =>
    items.reduce((sum, item) => sum + Number(item.unitCost ?? 0) * item.quantity, 0);

  const websiteCOGS = sumCost(orderItems);
  const localCOGS = sumCost(localSaleItems);

  return { websiteCOGS, localCOGS, totalCOGS: websiteCOGS + localCOGS };
}

// ---------------------------------------------------------------------------
// Expense breakdown — reuses Phase 11's non-deleted filter, exposed here for the profit summary
// ---------------------------------------------------------------------------

export type ExpenseCategoryTotal = { category: string; total: number };

type ExpenseCategoryRow = { category: string; _sum: { amount: unknown } };

type ExpenseClient = {
  groupBy: (args: Record<string, unknown>) => Promise<ExpenseCategoryRow[]>;
};

export async function getExpenseBreakdown(
  ctx: AuthContext,
  range: DateRange,
  client: ExpenseClient = prisma.expense as unknown as ExpenseClient,
): Promise<ExpenseCategoryTotal[]> {
  requireRole(ctx, "SUPER_ADMIN");

  // deletedAt: null — a soft-deleted expense (Phase 11) must not count toward totals.
  const rows = await client.groupBy({
    by: ["category"],
    where: { deletedAt: null, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
  });

  return rows.map((row) => ({ category: row.category, total: Number(row._sum.amount ?? 0) }));
}

// ---------------------------------------------------------------------------
// Profit summary — the single function every report/dashboard tile reads from
// ---------------------------------------------------------------------------

export type ProfitSummary = RevenueBreakdown &
  CogsBreakdown & {
    expenseBreakdown: ExpenseCategoryTotal[];
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
  };

export async function getProfitSummary(
  ctx: AuthContext,
  range: DateRange,
  deps: { revenue?: RevenueClient; cogs?: CogsClient; expense?: ExpenseClient } = {},
): Promise<ProfitSummary> {
  requireRole(ctx, "SUPER_ADMIN");

  const [revenue, cogs, expenseBreakdown] = await Promise.all([
    getRevenue(ctx, range, deps.revenue),
    getCostOfGoodsSold(ctx, range, deps.cogs),
    getExpenseBreakdown(ctx, range, deps.expense),
  ]);

  const totalExpenses = expenseBreakdown.reduce((sum, row) => sum + row.total, 0);
  const grossProfit = revenue.totalRevenue - cogs.totalCOGS;
  const netProfit = grossProfit - totalExpenses;

  return { ...revenue, ...cogs, expenseBreakdown, totalExpenses, grossProfit, netProfit };
}

// ---------------------------------------------------------------------------
// Inventory valuation — current stock × cost, a snapshot of money tied up right now (not
// date-ranged, since it's "as of now" by definition)
// ---------------------------------------------------------------------------

export type InventoryValue = { atCost: number; atRetail: number; potentialGrossProfit: number };

type ValuationProductRow = { stockQuantity: number; purchasePrice: unknown; retailPrice: unknown };

type InventoryValueClient = {
  findMany: (args: Record<string, unknown>) => Promise<ValuationProductRow[]>;
};

export async function getInventoryValue(
  ctx: AuthContext,
  client: InventoryValueClient = prisma.product as unknown as InventoryValueClient,
): Promise<InventoryValue> {
  requireRole(ctx, "SUPER_ADMIN");

  const products = await client.findMany({
    where: { status: { not: "DISCONTINUED" } },
    select: { stockQuantity: true, purchasePrice: true, retailPrice: true },
  });

  const atCost = products.reduce((sum, product) => sum + product.stockQuantity * Number(product.purchasePrice), 0);
  const atRetail = products.reduce((sum, product) => sum + product.stockQuantity * Number(product.retailPrice), 0);

  return { atCost, atRetail, potentialGrossProfit: atRetail - atCost };
}

// ---------------------------------------------------------------------------
// Top-selling products — by quantity and by revenue, combining both channels
// ---------------------------------------------------------------------------
//
// Aggregated in application code rather than a raw-SQL UNION ALL + GROUP BY: the item counts
// involved for a single date-range report are small, this keeps the query injection-surface at
// zero, and it's directly unit-testable without a real Postgres GROUP BY.

export type TopProductRow = { name: string; quantity: number; revenue: number };

type TopProductItemRow = { productName: string; quantity: number; lineTotal: unknown };

type TopProductsClient = {
  orderItem: { findMany: (args: Record<string, unknown>) => Promise<TopProductItemRow[]> };
  localSaleItem: { findMany: (args: Record<string, unknown>) => Promise<TopProductItemRow[]> };
};

export async function getTopProducts(
  ctx: AuthContext,
  range: DateRange,
  limit = 10,
  client: TopProductsClient = prisma as unknown as TopProductsClient,
): Promise<TopProductRow[]> {
  requireRole(ctx, "SUPER_ADMIN");

  const [orderItems, localSaleItems] = await Promise.all([
    client.orderItem.findMany({
      where: {
        order: { createdAt: { gte: range.from, lte: range.to }, status: { not: "CANCELLED" }, paymentStatus: "RECEIVED" },
      },
      select: { productName: true, quantity: true, lineTotal: true },
    }),
    client.localSaleItem.findMany({
      where: {
        localSale: {
          createdAt: { gte: range.from, lte: range.to },
          payments: { some: { status: "RECEIVED", voidedAt: null } },
        },
      },
      select: { productName: true, quantity: true, lineTotal: true },
    }),
  ]);

  const totals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of [...orderItems, ...localSaleItems]) {
    const entry = totals.get(item.productName) ?? { quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.lineTotal);
    totals.set(item.productName, entry);
  }

  return [...totals.entries()]
    .map(([name, { quantity, revenue }]) => ({ name, quantity, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
