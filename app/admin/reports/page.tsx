import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import {
  getInventoryValue,
  getProfitSummary,
  getTopProducts,
  resolvePeriodRange,
  type Period,
} from "@/lib/services/accounting.service";
import { getLowStockReport } from "@/lib/services/inventory.service";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const params = await searchParams;
  const periodParam = first(params.period);
  const fromParam = first(params.from);
  const toParam = first(params.to);

  const isCustom = periodParam === "custom" && fromParam && toParam;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "monthly";
  const range = isCustom ? { from: new Date(fromParam), to: new Date(toParam) } : resolvePeriodRange(period);

  const [summary, topProducts, inventoryValue, lowStock] = await Promise.all([
    getProfitSummary(ctx, range),
    getTopProducts(ctx, range, 10),
    getInventoryValue(ctx),
    getLowStockReport(ctx, { page: 1, pageSize: 5 }),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        {PERIODS.map((value) => (
          <Link
            key={value}
            href={`/admin/reports?period=${value}`}
            className={!isCustom && period === value ? "font-semibold underline" : "text-muted-foreground"}
          >
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <input type="hidden" name="period" value="custom" />
        <label className="block">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input type="date" name="from" defaultValue={fromParam} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input type="date" name="to" defaultValue={toParam} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Custom range
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Revenue</p>
          <p className="font-mono text-lg">Rs {summary.totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">
            Website Rs {summary.websiteRevenue.toLocaleString()} · POS Rs {summary.localRevenue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Cost of goods sold</p>
          <p className="font-mono text-lg">Rs {summary.totalCOGS.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Gross profit</p>
          <p className="font-mono text-lg">Rs {summary.grossProfit.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Net profit</p>
          <p className="font-mono text-lg">Rs {summary.netProfit.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">after Rs {summary.totalExpenses.toLocaleString()} expenses</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Inventory value (at cost)</p>
          <p className="font-mono text-lg">Rs {inventoryValue.atCost.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Inventory value (at retail)</p>
          <p className="font-mono text-lg">Rs {inventoryValue.atRetail.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Potential gross profit</p>
          <p className="font-mono text-lg">Rs {inventoryValue.potentialGrossProfit.toLocaleString()}</p>
        </div>
      </div>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="mb-3 font-medium">Expenses by category</h2>
        {summary.expenseBreakdown.length === 0 ? (
          <p className="text-muted-foreground">No expenses recorded for this range.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.expenseBreakdown.map((row) => (
              <div key={row.category}>
                <p className="text-xs text-muted-foreground">
                  {row.category.charAt(0) + row.category.slice(1).toLowerCase()}
                </p>
                <p className="font-mono">Rs {row.total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="mb-3 font-medium">Top products</h2>
        {topProducts.length === 0 ? (
          <p className="text-muted-foreground">No sales recorded for this range.</p>
        ) : (
          <table className="w-full">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Product</th>
                <th className="py-1 text-right">Qty sold</th>
                <th className="py-1 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((row) => (
                <tr key={row.name} className="border-t">
                  <td className="py-1">{row.name}</td>
                  <td className="py-1 text-right">{row.quantity}</td>
                  <td className="py-1 text-right font-mono">Rs {row.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-md border p-4 text-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Low stock</h2>
          <Link href="/admin/inventory" className="text-xs text-muted-foreground hover:underline">
            View full inventory dashboard →
          </Link>
        </div>
        {lowStock.items.length === 0 ? (
          <p className="text-muted-foreground">No products are at or below their minimum stock level.</p>
        ) : (
          <ul className="space-y-1">
            {(lowStock.items as Array<{ id: string; name: string; stockQuantity: number; minimumStock: number }>).map(
              (product) => (
                <li key={product.id} className="flex justify-between">
                  <span>{product.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {product.stockQuantity} / min {product.minimumStock}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
