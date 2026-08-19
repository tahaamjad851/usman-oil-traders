import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, PackageSearch, Search } from "lucide-react";

import { CategoryDials, type CategoryDial } from "@/components/storefront/CategoryDials";
import { listBrands } from "@/lib/services/brand.service";
import { listCategories } from "@/lib/services/category.service";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Genuine ZIC, Shell, Caltex, Total, PSO, Honda, Havoline and Suzuki engine oils and parts for cars, motorcycles, and tractors — Kot Samaba, Rahim Yar Khan.",
};

type CategoryNode = { id: string; name: string; slug: string; children?: CategoryNode[] };
type BrandNode = { id: string; name: string; slug: string };

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: "Browse the catalog",
    description: "Find the right oil or part by category, brand, or exact viscosity grade.",
  },
  {
    icon: MessageCircle,
    title: "Message us on WhatsApp",
    description: "Tell us what you need — we confirm it's in stock and quote the final price.",
  },
  {
    icon: PackageSearch,
    title: "Collect or get it delivered",
    description: "Pick it up at our Kot Samaba shop, or arrange delivery when you message us.",
  },
];

export default async function HomePage() {
  const [categories, brands] = await Promise.all([listCategories(), listBrands()]);
  const categoryList = categories as unknown as CategoryNode[];
  const brandList = brands as unknown as BrandNode[];

  const engineOils = categoryList.find((category) => category.slug === "engine-oils");
  const carEngineOil = engineOils?.children?.find((child) => child.slug === "car-engine-oil");
  const motorcycleParts = categoryList.find((category) => category.slug === "motorcycle-parts");
  const tractorParts = categoryList.find((category) => category.slug === "tractor-parts");

  const dials: CategoryDial[] = [
    { label: "Car Engine Oil", categoryId: carEngineOil?.id ?? null },
    { label: "Motorcycle", categoryId: motorcycleParts?.id ?? null },
    { label: "Tractor", categoryId: tractorParts?.id ?? null },
  ];

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-1 font-shop-display text-3xl font-semibold uppercase tracking-wide text-shop-ink">
          Find your oil in seconds
        </h1>
        <p className="mb-6 text-shop-muted">
          Genuine ZIC, Shell, Caltex, Total, PSO, Honda, Havoline &amp; Suzuki — in stock in Kot
          Samaba, Rahim Yar Khan.
        </p>
        <CategoryDials dials={dials} />
      </section>

      {brandList.length > 0 ? (
        <section className="border-y border-shop-ink/5 bg-shop-surface py-6">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="sr-only">Brands we carry</h2>
            <ul className="flex flex-wrap items-center justify-center gap-3">
              {brandList.map((brand) => (
                <li key={brand.id}>
                  <Link
                    href={`/products?brand=${brand.id}`}
                    className="rounded-full border border-shop-ink/10 bg-shop-card px-4 py-1.5 text-sm text-shop-muted transition hover:border-shop-amber hover:text-shop-ink"
                  >
                    {brand.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {categoryList.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="mb-4 font-shop-display text-xl uppercase tracking-wide text-shop-ink">
            Top categories
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {categoryList.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.id}`}
                className="rounded-lg border border-shop-ink/5 bg-shop-card px-3 py-4 text-center text-sm font-medium text-shop-ink transition hover:border-shop-amber/40"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="mb-6 font-shop-display text-xl uppercase tracking-wide text-shop-ink">
          How ordering works
        </h2>
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-shop-ink/5 bg-shop-card p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-shop-mono text-sm text-shop-amber">{index + 1}</span>
                <step.icon className="h-5 w-5 text-shop-amber" aria-hidden="true" />
              </div>
              <h3 className="font-shop-display text-sm uppercase tracking-wide text-shop-ink">
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-shop-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-shop-ink/5 bg-shop-surface">
        <div className="mx-auto max-w-3xl px-4 py-10 text-center">
          <h2 className="font-shop-display text-lg uppercase tracking-wide text-shop-ink">
            About Usman Oil Traders
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-shop-muted">
            A family-run oil and parts shop based in Kot Samaba, Rahim Yar Khan. We stock genuine
            engine oils for cars, motorcycles, and tractors, along with motorcycle and tractor
            spare parts — the right grade, in stock, without the guesswork.
          </p>
        </div>
      </section>
    </div>
  );
}
