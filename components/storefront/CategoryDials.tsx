import Link from "next/link";
import { Bike, Car, Tractor } from "lucide-react";

export type CategoryDial = {
  label: string;
  categoryId: string | null;
};

const ICONS = [Car, Bike, Tractor];

export function CategoryDials({ dials }: { dials: CategoryDial[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {dials.map(({ label, categoryId }, index) => {
        const Icon = ICONS[index % ICONS.length];
        const href = categoryId ? `/products?category=${categoryId}` : "/products";
        return (
          <Link
            key={label}
            href={href}
            className="group relative overflow-hidden rounded-lg border border-shop-ink/5 bg-shop-card p-6 transition hover:border-shop-amber/40"
          >
            <div
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-shop-red/10 blur-2xl transition group-hover:bg-shop-amber/20"
              aria-hidden="true"
            />
            <Icon className="mb-4 h-8 w-8 text-shop-amber" strokeWidth={1.5} aria-hidden="true" />
            <div className="font-shop-display text-lg uppercase tracking-wide text-shop-ink">{label}</div>
            <div className="mt-1 text-sm text-shop-muted">Shop now →</div>
          </Link>
        );
      })}
    </div>
  );
}
