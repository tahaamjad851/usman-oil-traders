import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { getSupplierWithBalance } from "@/lib/services/supplier.service";

import { SupplierPaymentForm } from "./supplier-payment-form";

type PurchaseRow = {
  id: string;
  purchaseDate: string | Date;
  invoiceNumber: string | null;
  totalAmount: string;
  paymentStatus: string;
};

type SupplierPaymentRow = {
  id: string;
  purchaseId: string | null;
  amount: string;
  method: string;
  paidAt: string | Date;
};

export default async function SupplierDetailPage({
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
  const supplier = await getSupplierWithBalance(ctx, id);
  const purchases = supplier.purchases as unknown as PurchaseRow[];
  const payments = supplier.payments as unknown as SupplierPaymentRow[];

  const openPurchases = purchases
    .filter((purchase) => purchase.paymentStatus !== "PAID")
    .map((purchase) => ({
      id: purchase.id,
      label: `${purchase.invoiceNumber ?? purchase.id.slice(0, 8)} — Rs ${Number(purchase.totalAmount).toLocaleString()}`,
    }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/admin/khata" className="text-sm text-muted-foreground hover:underline">
          ← Khata
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{supplier.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {supplier.company ? `${supplier.company} · ` : ""}
          {supplier.phone ?? "No phone on file"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Total purchased</p>
          <p className="font-mono text-lg">Rs {supplier.totalPurchased.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Total paid</p>
          <p className="font-mono text-lg">Rs {supplier.totalPaid.toLocaleString()}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Balance owed</p>
          <p className="font-mono text-lg">Rs {supplier.balance.toLocaleString()}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Purchases</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No purchases recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-t">
                    <td className="px-3 py-2">{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{purchase.invoiceNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      Rs {Number(purchase.totalAmount).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{purchase.paymentStatus.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {payment.method.replaceAll("_", " ")} · {new Date(payment.paidAt).toLocaleDateString()}
                  {payment.purchaseId ? " · against a specific purchase" : " · general payment"}
                </span>
                <span className="font-mono">Rs {Number(payment.amount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Record a payment</h2>
        <SupplierPaymentForm supplierId={supplier.id} openPurchases={openPurchases} />
      </section>
    </main>
  );
}
