import Link from "next/link";

import type { StockStatus } from "@/lib/services/product.service";

import { SpecPlate } from "./SpecPlate";
import { StockBadge } from "./StockBadge";

type ProductCardProps = {
  slug: string;
  name: string;
  brandName?: string | null;
  imageUrl?: string | null;
  retailPrice: number;
  viscosity?: string | null;
  size?: string | null;
  oilType?: string | null;
  stockStatus: StockStatus;
};

export function ProductCard(product: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-shop-ink/5 bg-shop-card transition hover:border-shop-ink/15"
    >
      <div className="relative aspect-square bg-shop-surface">
        {product.imageUrl ? (
          // Product images live in admin-configured external storage (R2/S3) whose domain isn't
          // known ahead of time, so a plain <img> avoids next/image's remote-domain allowlist
          // requirement rather than needing storage configured before any image can render.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-4 transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-shop-muted">No image</div>
        )}
        {product.stockStatus === "OUT_OF_STOCK" && (
          <span className="absolute left-2 top-2 rounded-full bg-shop-red/90 px-2 py-0.5 text-xs font-medium text-white">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {product.brandName ? (
          <span className="text-xs uppercase tracking-wide text-shop-muted">{product.brandName}</span>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-medium text-shop-ink">{product.name}</h3>
        <SpecPlate viscosity={product.viscosity} size={product.size} oilType={product.oilType} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="font-shop-mono text-base font-semibold text-shop-green">
            Rs {product.retailPrice.toLocaleString()}
          </span>
          {product.stockStatus === "LOW_STOCK" ? <StockBadge status={product.stockStatus} /> : null}
        </div>
      </div>
    </Link>
  );
}
