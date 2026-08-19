import type { StockStatus } from "@/lib/services/product.service";

const LABELS: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
};

const CLASSES: Record<StockStatus, string> = {
  IN_STOCK: "bg-shop-green/10 text-shop-green",
  LOW_STOCK: "bg-shop-amber/10 text-shop-amber",
  OUT_OF_STOCK: "bg-shop-red/10 text-shop-red",
};

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
