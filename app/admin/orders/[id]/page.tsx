import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { getOrder } from "@/lib/services/order.service";
import { computeOrderPaymentSummary } from "@/lib/services/payment.service";
import { toWhatsAppNumber } from "@/lib/utils/phone";
import { buildStaffContactMessage } from "@/lib/services/whatsapp-message.service";

import { OrderStatusForm } from "./status-form";
import { PaymentForm } from "./payment-form";
import { VoidPaymentButton } from "./void-payment-button";
import { WhatsAppCustomerButton } from "./whatsapp-button";

type OrderItemRow = { id: string; productName: string; quantity: number; unitPrice: string; lineTotal: string };

type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  status: string;
  receivedAt: string | Date;
  voidedAt: string | Date | null;
  voidReason: string | null;
};

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerNotes: string | null;
  websiteSubtotal: string;
  finalConfirmedAmount: string | null;
  createdAt: string | Date;
  items: OrderItemRow[];
  payments: PaymentRow[];
};

export default async function AdminOrderDetailPage({
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
  const order = (await getOrder(ctx, id)) as OrderDetail;

  const paymentSummary = computeOrderPaymentSummary(order);
  const staffMessage = buildStaffContactMessage(order);
  const normalizedCustomerNumber = toWhatsAppNumber(order.customerPhone);
  const customerWhatsappLink = normalizedCustomerNumber
    ? `https://wa.me/${normalizedCustomerNumber}?text=${encodeURIComponent(staffMessage)}`
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Order {order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: {order.status.replaceAll("_", " ")} · Payment: {order.paymentStatus.replaceAll("_", " ")}
        </p>
      </div>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="mb-2 font-medium">Customer</h2>
        <p>{order.customerName}</p>
        <p className="text-muted-foreground">{order.customerPhone}</p>
        {order.customerAddress ? <p className="text-muted-foreground">{order.customerAddress}</p> : null}
        {order.customerNotes ? (
          <p className="mt-2 text-muted-foreground">Notes: {order.customerNotes}</p>
        ) : null}

        <div className="mt-4">
          {customerWhatsappLink ? (
            <WhatsAppCustomerButton
              orderId={order.id}
              currentStatus={order.status}
              whatsappLink={customerWhatsappLink}
            />
          ) : (
            <p className="text-xs text-destructive">
              &quot;{order.customerPhone}&quot; doesn&apos;t look like a valid Pakistani mobile
              number — can&apos;t generate a WhatsApp link.
            </p>
          )}
        </div>

        {customerWhatsappLink ? (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Preview message</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-2">{staffMessage}</pre>
          </details>
        ) : null}
      </section>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="mb-2 font-medium">Items</h2>
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Product</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Unit price</th>
              <th className="py-1 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="py-1">{item.productName}</td>
                <td className="py-1 text-right">{item.quantity}</td>
                <td className="py-1 text-right font-mono">Rs {Number(item.unitPrice).toLocaleString()}</td>
                <td className="py-1 text-right font-mono">Rs {Number(item.lineTotal).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-between border-t pt-2 font-medium">
          <span>Website subtotal</span>
          <span className="font-mono">Rs {Number(order.websiteSubtotal).toLocaleString()}</span>
        </div>
        {order.finalConfirmedAmount ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Final confirmed amount</span>
            <span className="font-mono">Rs {Number(order.finalConfirmedAmount).toLocaleString()}</span>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border p-4 text-sm">
        <h2 className="mb-2 font-medium">Payments</h2>

        {paymentSummary.status === "UNCONFIRMED" ? (
          <p className="text-muted-foreground">
            Confirm the final order amount (via Update status below, with the amount fields) before
            recording payments.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Confirmed total</p>
                <p className="font-mono">Rs {paymentSummary.confirmedTotal!.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-mono">Rs {paymentSummary.totalPaid.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-mono">Rs {paymentSummary.remaining!.toLocaleString()}</p>
              </div>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Status: {paymentSummary.status.replaceAll("_", " ")}
            </p>

            {order.payments.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {order.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                      payment.voidedAt ? "opacity-50" : ""
                    }`}
                  >
                    <span className="text-muted-foreground">
                      {payment.method.replaceAll("_", " ")} ·{" "}
                      {new Date(payment.receivedAt).toLocaleDateString()}
                      {payment.voidedAt ? ` · voided (${payment.voidReason ?? "no reason given"})` : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono">Rs {Number(payment.amount).toLocaleString()}</span>
                      {!payment.voidedAt && ctx.role === "SUPER_ADMIN" ? (
                        <VoidPaymentButton paymentId={payment.id} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {order.status !== "CANCELLED" && paymentSummary.status !== "FULLY_PAID" ? (
              <PaymentForm orderId={order.id} remaining={paymentSummary.remaining!} />
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Update status</h2>
        <OrderStatusForm orderId={order.id} currentStatus={order.status} />
      </section>
    </main>
  );
}
