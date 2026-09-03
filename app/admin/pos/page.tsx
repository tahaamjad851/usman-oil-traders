"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ProductSearch, type SearchResultProduct } from "@/components/admin/ProductSearch";

import { PaymentPanel, type CompleteSaleDetails } from "./payment-panel";
import { QuickAdjustPanel } from "./quick-adjust-panel";
import { SaleTicket, type TicketItem } from "./sale-ticket";

export default function PosPage() {
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string>();
  const [completing, setCompleting] = useState(false);

  function addProduct(product: SearchResultProduct) {
    setTicket((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, item.availableStock) }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: Number(product.retailPrice),
          quantity: 1,
          availableStock: product.stockQuantity,
        },
      ];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setTicket((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, Math.min(quantity, item.availableStock)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(productId: string) {
    setTicket((prev) => prev.filter((item) => item.productId !== productId));
  }

  const total = ticket.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  async function completeSale(details: CompleteSaleDetails) {
    setCompleting(true);
    setError(undefined);

    const response = await fetch("/api/local-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: ticket.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        ...details,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to complete the sale.");
      setCompleting(false);
      return;
    }

    const sale = (await response.json()) as { id: string };
    setTicket([]);
    setCustomerName("");
    setCustomerPhone("");
    setCompleting(false);
    router.push(`/admin/pos/receipt/${sale.id}`);
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Point of Sale</h1>
          <div className="flex items-center gap-4">
            <QuickAdjustPanel />
            <a href="/admin/pos/history" className="text-sm text-muted-foreground hover:underline">
              Sales history
            </a>
          </div>
        </div>
        <ProductSearch onSelect={addProduct} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex flex-col border-l">
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Customer name (optional)"
            className="rounded border bg-background px-2 py-1.5 text-sm"
          />
          <input
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="Phone (optional)"
            className="rounded border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <SaleTicket items={ticket} onUpdateQty={updateQuantity} onRemove={removeItem} />
        <PaymentPanel total={total} disabled={ticket.length === 0 || completing} onComplete={completeSale} />
      </div>
    </div>
  );
}
