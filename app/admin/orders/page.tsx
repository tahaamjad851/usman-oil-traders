import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listOrders } from "@/lib/services/order.service";
import { orderStatuses } from "@/lib/validation/order.schema";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  websiteSubtotal: string;
  createdAt: string | Date;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminOrdersPage({
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
  const statusParam = first(params.status) as (typeof orderStatuses)[number] | undefined;

  const result = await listOrders(ctx, { status: statusParam, page: 1, pageSize: 50 });
  const orders = result.items as OrderRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {ctx.username} ({ctx.role})
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/orders" className={!statusParam ? "font-semibold underline" : "text-muted-foreground"}>
          All
        </Link>
        {orderStatuses.map((status) => (
          <Link
            key={status}
            href={`/admin/orders?status=${status}`}
            className={statusParam === status ? "font-semibold underline" : "text-muted-foreground"}
          >
            {status.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div>{order.customerName}</div>
                    <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                  </td>
                  <td className="px-3 py-2">{order.status.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-right">Rs {Number(order.websiteSubtotal).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(order.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
