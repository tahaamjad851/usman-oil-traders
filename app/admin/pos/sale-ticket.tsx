"use client";

import { Minus, Plus, X } from "lucide-react";

export type TicketItem = {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
};

export function SaleTicket({
  items,
  onUpdateQty,
  onRemove,
}: {
  items: TicketItem[];
  onUpdateQty: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Search a product to start a sale.
      </div>
    );
  }

  return (
    <ul className="flex-1 space-y-2 overflow-y-auto p-3">
      {items.map((item) => (
        <li key={item.productId} className="flex items-center gap-2 rounded-lg border p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{item.name}</p>
            <p className="font-mono text-xs text-muted-foreground">Rs {item.unitPrice.toLocaleString()} each</p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
            className="rounded border p-1"
            aria-label={`Decrease quantity of ${item.name}`}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-6 text-center font-mono text-sm">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
            disabled={item.quantity >= item.availableStock}
            className="rounded border p-1 disabled:opacity-30"
            aria-label={`Increase quantity of ${item.name}`}
          >
            <Plus className="h-3 w-3" />
          </button>
          <span className="w-20 text-right font-mono text-sm">
            Rs {(item.unitPrice * item.quantity).toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.productId)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
