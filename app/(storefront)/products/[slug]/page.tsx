import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SpecPlate } from "@/components/storefront/SpecPlate";
import { StockBadge } from "@/components/storefront/StockBadge";
import { getProductBySlug, type StockStatus } from "@/lib/services/product.service";
import { getWhatsAppNumber, whatsAppLink } from "@/lib/services/settings.service";

type PublicProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  compatibility: string | null;
  viscosity: string | null;
  size: string | null;
  oilType: string | null;
  retailPrice: string;
  stockStatus: StockStatus;
  brand: { name: string } | null;
  category: { name: string } | null;
  images: Array<{ url: string; thumbUrl: string | null; altText: string | null }>;
};

type PageParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = (await getProductBySlug(null, slug)) as PublicProductDetail | null;
  if (!product) return { title: "Product not found" };

  return {
    title: product.name,
    description:
      product.description ?? `${product.name} — genuine parts and oils at Usman Oil Traders, Kot Samaba.`,
    openGraph: product.images[0] ? { images: [{ url: product.images[0].url }] } : undefined,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const [product, whatsapp] = await Promise.all([
    getProductBySlug(null, slug) as Promise<PublicProductDetail | null>,
    getWhatsAppNumber(),
  ]);

  if (!product) {
    notFound();
  }

  const image = product.images[0];
  const inquiryMessage = `Hi, I'm interested in ${product.name} — is it available?`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <article className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg border border-shop-ink/5 bg-shop-surface">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.altText ?? product.name}
              className="h-full w-full object-contain p-6"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-shop-muted">
              No image available
            </div>
          )}
        </div>

        <div>
          {product.brand ? (
            <span className="text-sm uppercase tracking-wide text-shop-muted">{product.brand.name}</span>
          ) : null}
          <h1 className="mt-1 font-shop-display text-2xl font-semibold uppercase tracking-wide text-shop-ink">
            {product.name}
          </h1>
          {product.category ? (
            <p className="mt-1 text-xs text-shop-muted">
              In <span className="text-shop-ink">{product.category.name}</span>
            </p>
          ) : null}

          <div className="mt-3">
            <SpecPlate viscosity={product.viscosity} size={product.size} oilType={product.oilType} />
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-shop-mono text-3xl font-semibold text-shop-green">
              Rs {Number(product.retailPrice).toLocaleString()}
            </span>
            <StockBadge status={product.stockStatus} />
          </div>

          <p className="mt-2 text-xs text-shop-muted">
            Website price shown is indicative. Final price and delivery charges will be confirmed
            through WhatsApp.
          </p>

          {product.compatibility ? (
            <div className="mt-4 rounded-lg border border-shop-ink/5 bg-shop-card p-3 text-sm text-shop-muted">
              <span className="text-shop-ink">Fits: </span>
              {product.compatibility}
            </div>
          ) : null}

          {product.description ? (
            <p className="mt-4 text-sm leading-relaxed text-shop-muted">{product.description}</p>
          ) : null}

          <div className="mt-6">
            {whatsapp ? (
              <a
                href={whatsAppLink(whatsapp, inquiryMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-shop-green px-5 py-2.5 text-sm font-medium text-shop-bg transition hover:bg-shop-green/90"
              >
                Ask about this on WhatsApp
              </a>
            ) : (
              <p className="text-sm text-shop-muted">Contact details coming soon.</p>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
