import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { getLocalSale } from "@/lib/services/local-sale.service";

import { PrintButton } from "./print-button";

type SaleItemRow = { id: string; productName: string; quantity: number; lineTotal: string };

type SaleDetail = {
  saleNumber: string;
  totalAmount: string;
  createdAt: string | Date;
  items: SaleItemRow[];
  soldBy: { name: string } | null;
  customer: { name: string; phone: string } | null;
  payments: Array<{ method: string; amountTendered: string | null }>;
};

export default async function PosReceiptPage({
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
  const sale = (await getLocalSale(ctx, id)) as unknown as SaleDetail;
  const payment = sale.payments[0];
  const tendered = payment?.amountTendered ? Number(payment.amountTendered) : null;
  const changeDue = tendered !== null ? tendered - Number(sale.totalAmount) : null;

  return (
    <div className="mx-auto max-w-sm bg-white p-6 text-black print:p-0">
      <h1 className="text-center text-lg font-bold">Usman Oil Traders</h1>
      <p className="text-center text-xs text-gray-600">Kot Samaba, Rahim Yar Khan</p>
      <p className="mt-2 text-center font-mono text-sm">{sale.saleNumber}</p>
      <p className="text-center text-xs text-gray-600">{new Date(sale.createdAt).toLocaleString()}</p>
      {sale.customer ? (
        <p className="mt-1 text-center text-xs text-gray-600">
          {sale.customer.name} · {sale.customer.phone}
        </p>
      ) : null}

      <hr className="my-3" />

      {sale.items.map((item) => (
        <div key={item.id} className="flex justify-between text-sm">
          <span>
            {item.productName} × {item.quantity}
          </span>
          <span>Rs {Number(item.lineTotal).toLocaleString()}</span>
        </div>
      ))}

      <hr className="my-3" />

      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>Rs {Number(sale.totalAmount).toLocaleString()}</span>
      </div>
      {payment ? (
        <p className="mt-1 text-xs text-gray-600">Paid via {payment.method.replaceAll("_", " ")}</p>
      ) : null}
      {tendered !== null ? (
        <>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Tendered</span>
            <span>Rs {tendered.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Change</span>
            <span>Rs {(changeDue ?? 0).toLocaleString()}</span>
          </div>
        </>
      ) : null}
      {sale.soldBy ? <p className="mt-2 text-xs text-gray-600">Served by {sale.soldBy.name}</p> : null}

      <p className="mt-4 text-center text-xs text-gray-500">Thank you for your business</p>

      <PrintButton />
    </div>
  );
}
