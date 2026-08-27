import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { getCustomerWithHistory } from "@/lib/services/customer.service";

import { CustomerPaymentForm } from "./customer-payment-form";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  websiteSubtotal: string;
  finalConfirmedAmount: string | null;
  createdAt: string | Date;
};
type LocalSaleRow = { id: string; saleNumber: string; totalAmount: string; createdAt: string | Date };
type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  voidedAt: string | Date | null;
  receivedAt: string | Date;
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const customer = await getCustomerWithHistory(ctx, id);
  const orders = customer.orders as unknown as OrderRow[];
  const localSales = customer.localSales as unknown as LocalSaleRow[];
  const payments = customer.payments as unknown as PaymentRow[];

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/admin/khata?tab=buyers" className="text-sm text-muted-foreground hover:underline">
          ← Khata
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{customer.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{customer.phone}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Total owed</p>
          <p className="font-mono text-lg">Rs {customer.totalOwed.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Total paid</p>
          <p className="font-mono text-lg">Rs {customer.totalPaid.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Balance owed</p>
          <p className="font-mono text-lg">Rs {customer.balance.toLocaleString()}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No website orders yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  <Link href={`/admin/orders/${order.id}`} className="font-mono hover:underline">
                    {order.orderNumber}
                  </Link>{" "}
                  · {order.status.replaceAll("_", " ")} · {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <span className="font-mono">
                  Rs {Number(order.finalConfirmedAmount ?? order.websiteSubtotal).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">In-store sales</h2>
        {localSales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No in-store sales yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {localSales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{sale.saleNumber}</span>
                <span className="text-muted-foreground">{new Date(sale.createdAt).toLocaleDateString()}</span>
                <span className="font-mono">Rs {Number(sale.totalAmount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                  payment.voidedAt ? "opacity-50" : ""
                }`}
              >
                <span className="text-muted-foreground">
                  {payment.method.replaceAll("_", " ")} · {new Date(payment.receivedAt).toLocaleDateString()}
                  {payment.voidedAt ? " · voided" : ""}
                </span>
                <span className="font-mono">Rs {Number(payment.amount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Record a payment</h2>
        <CustomerPaymentForm customerId={customer.id} />
      </section>
    </main>
  );
}
