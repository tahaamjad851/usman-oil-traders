import "dotenv/config";

import { prisma } from "@/lib/db";

// One-time backfill for Phase 12's OrderItem.unitCost / LocalSaleItem.unitCost columns. Existing
// rows (from before this migration) have no historical cost snapshot, so the best available
// substitute is each product's CURRENT purchasePrice — an approximation, not a true historical
// figure, since the actual cost at the time of that sale may have differed. Idempotent: only
// touches rows where unitCost is still null, so re-running it is safe and it never overwrites a
// value that was correctly snapshotted going forward by the Phase 7/9 code paths.

async function backfillOrderItems() {
  const items = await prisma.orderItem.findMany({
    where: { unitCost: null },
    select: { id: true, productId: true },
  });

  let updated = 0;
  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { purchasePrice: true },
    });
    if (!product) continue;
    await prisma.orderItem.update({ where: { id: item.id }, data: { unitCost: product.purchasePrice } });
    updated += 1;
  }
  return updated;
}

async function backfillLocalSaleItems() {
  const items = await prisma.localSaleItem.findMany({
    where: { unitCost: null },
    select: { id: true, productId: true },
  });

  let updated = 0;
  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { purchasePrice: true },
    });
    if (!product) continue;
    await prisma.localSaleItem.update({ where: { id: item.id }, data: { unitCost: product.purchasePrice } });
    updated += 1;
  }
  return updated;
}

const [orderItemsUpdated, localSaleItemsUpdated] = await Promise.all([
  backfillOrderItems(),
  backfillLocalSaleItems(),
]);

await prisma.$disconnect();
console.info(
  `Backfilled unitCost for ${orderItemsUpdated} OrderItem row(s) and ${localSaleItemsUpdated} LocalSaleItem row(s) using each product's current purchasePrice.`,
);
