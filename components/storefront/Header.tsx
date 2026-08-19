import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";

import { getWhatsAppNumber, whatsAppLink } from "@/lib/services/settings.service";

export async function Header() {
  const whatsapp = await getWhatsAppNumber();

  return (
    <header className="sticky top-0 z-50 border-b border-shop-ink/5 bg-shop-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="font-shop-display shrink-0 text-xl font-semibold uppercase tracking-wider text-shop-ink"
        >
          Usman <span className="text-shop-red">Oil</span> Traders
        </Link>

        <form action="/products" className="hidden flex-1 md:flex" role="search">
          <div className="relative w-full">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-shop-muted"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="desktop-search">
              Search products
            </label>
            <input
              id="desktop-search"
              name="q"
              placeholder="Search by name, SKU, or viscosity (e.g. 5W-30)"
              className="w-full rounded-full border border-shop-ink/10 bg-shop-card py-2 pl-10 pr-4 text-sm text-shop-ink placeholder:text-shop-muted focus:border-shop-amber focus:outline-none"
            />
          </div>
        </form>

        {whatsapp ? (
          <a
            href={whatsAppLink(whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-full bg-shop-green/10 px-4 py-2 text-sm font-medium text-shop-green transition hover:bg-shop-green/20"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">WhatsApp Us</span>
          </a>
        ) : null}
      </div>

      <form action="/products" className="px-4 pb-3 md:hidden" role="search">
        <label className="sr-only" htmlFor="mobile-search">
          Search products
        </label>
        <input
          id="mobile-search"
          name="q"
          placeholder="Search products..."
          className="w-full rounded-full border border-shop-ink/10 bg-shop-card px-4 py-2 text-sm text-shop-ink placeholder:text-shop-muted focus:border-shop-amber focus:outline-none"
        />
      </form>
    </header>
  );
}
