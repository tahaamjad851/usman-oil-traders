import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listUnifiedPayments } from "@/lib/services/payment.service";
import { paymentMethods } from "@/lib/validation/payment.schema";

type PaymentRow = {
  id: string;
  source: string;
  amount: unknown;
  method: string;
  receivedBy: string;
  receivedAt: string | Date;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPaymentsPage({
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
  const method = first(params.method) as (typeof paymentMethods)[number] | undefined;

  // requireRole(SUPER_ADMIN) inside listUnifiedPayments is the real gate — the /admin/payments
  // middleware prefix (proxy.ts) is a UX-level redirect on top of it, same defense-in-depth
  // pattern as every other owner-only admin section.
  const result = await listUnifiedPayments(ctx, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    method,
    page: 1,
    pageSize: 100,
  });
  const payments = result.items as PaymentRow[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified reconciliation across POS sales and website orders.
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
        <label className="block">
          <span className="mb-1 block text-muted-foreground">Method</span>
          <select name="method" defaultValue={method ?? ""} className="rounded border bg-background px-2 py-1.5">
            <option value="">All</option>
            {paymentMethods.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Filter
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Grand total</p>
          <p className="font-mono text-lg">Rs {result.grandTotal.toLocaleString()}</p>
        </div>
        {Object.entries(result.totalsByMethod).map(([methodName, total]) => (
          <div key={methodName} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{methodName.replaceAll("_", " ")}</p>
            <p className="font-mono text-lg">Rs {total.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Received by</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t">
                  <td className="px-3 py-2">{payment.source}</td>
                  <td className="px-3 py-2">{payment.method.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2">{payment.receivedBy}</td>
                  <td className="px-3 py-2 text-right font-mono">Rs {Number(payment.amount).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(payment.receivedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{result.total} payments total</p>
    </main>
  );
}
