import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listLocalSales } from "@/lib/services/local-sale.service";

type SaleRow = {
  id: string;
  saleNumber: string;
  totalAmount: string;
  createdAt: string | Date;
  soldBy: { name: string } | null;
  customer: { name: string } | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PosHistoryPage({
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
  const from = first(params.from);
  const to = first(params.to);

  const result = await listLocalSales(ctx, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    page: 1,
    pageSize: 50,
  });
  const sales = result.items as unknown as SaleRow[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">POS Sales History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {ctx.username} ({ctx.role})
          {ctx.role === "STAFF" ? " — showing your own sales only" : ""}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="block">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input type="date" name="from" defaultValue={from} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input type="date" name="to" defaultValue={to} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Filter
        </button>
      </form>

      {sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Sale</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Sold by</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/admin/pos/receipt/${sale.id}`} className="font-mono text-xs hover:underline">
                      {sale.saleNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{sale.customer?.name ?? "Walk-in"}</td>
                  <td className="px-3 py-2">{sale.soldBy?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right">Rs {Number(sale.totalAmount).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(sale.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
