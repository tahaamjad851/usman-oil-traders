import "server-only";

import { prisma } from "@/lib/db";

type PriceableProduct = {
  id: string;
  retailPrice: unknown;
  mechanicPrice?: unknown;
  wholesalePrice?: unknown;
};

type PricingReaders = {
  findCustomer: (customerId: string) => Promise<{ tier: string } | null>;
  findOverride: (customerId: string, productId: string) => Promise<{ price: unknown } | null>;
};

const defaultReaders: PricingReaders = {
  findCustomer: (customerId) => prisma.customer.findUnique({ where: { id: customerId } }),
  findOverride: (customerId, productId) =>
    prisma.customerPrice.findUnique({
      where: { customerId_productId: { customerId, productId } },
    }),
};

/**
 * Resolution order, applied wherever a price is shown to a specific customer context
 * (mainly POS and repeat-customer order flows — the anonymous storefront always shows
 * retailPrice and never calls this):
 *   1. A row-level CustomerPrice override always wins.
 *   2. Otherwise the customer's tier price, falling back to retailPrice if that tier's
 *      price isn't set on this product (including the CUSTOM tier, which has no price
 *      column of its own and relies entirely on a CustomerPrice override).
 */
export async function resolveCustomerPrice(
  customerId: string | null,
  product: PriceableProduct,
  readers: PricingReaders = defaultReaders,
): Promise<number> {
  if (!customerId) return Number(product.retailPrice);

  const customer = await readers.findCustomer(customerId);
  if (!customer) return Number(product.retailPrice);

  const override = await readers.findOverride(customerId, product.id);
  if (override) return Number(override.price);

  switch (customer.tier) {
    case "MECHANIC":
      return Number(product.mechanicPrice ?? product.retailPrice);
    case "WHOLESALE":
      return Number(product.wholesalePrice ?? product.retailPrice);
    default:
      return Number(product.retailPrice);
  }
}
