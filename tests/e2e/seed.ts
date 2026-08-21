import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { TEST_DATABASE_URL } from "../integration/pg-test-server";
import {
  E2E_CHECKOUT_PRODUCT_SLUG,
  E2E_OUT_OF_STOCK_PRODUCT_SLUG,
  E2E_POS_PRODUCT_SKU,
  E2E_SEEDED_ORDER_NUMBER,
  E2E_STAFF,
  E2E_SUPER_ADMIN,
} from "./fixtures";

// Not imported from lib/auth/password.ts: that module has a top-level `import "server-only"`,
// which unconditionally throws under plain `tsx` execution outside of Next's own bundler (the
// package relies on a "react-server" export condition that only Next sets) — same parameters as
// hashPassword(), inlined here to avoid pulling that guard into a standalone seed script.
async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(TEST_DATABASE_URL) });

  const category = await prisma.category.create({
    data: { name: "E2E Category", slug: "e2e-category" },
  });

  await prisma.user.create({
    data: {
      name: "E2E Super Admin",
      username: E2E_SUPER_ADMIN.username,
      passwordHash: await hashPassword(E2E_SUPER_ADMIN.password),
      role: "SUPER_ADMIN",
    },
  });

  await prisma.user.create({
    data: {
      name: "E2E Staff",
      username: E2E_STAFF.username,
      passwordHash: await hashPassword(E2E_STAFF.password),
      role: "STAFF",
    },
  });

  await prisma.product.create({
    data: {
      sku: "E2E-CHECKOUT-SKU",
      name: "E2E Checkout Engine Oil 4L",
      slug: E2E_CHECKOUT_PRODUCT_SLUG,
      categoryId: category.id,
      purchasePrice: "1500.00",
      retailPrice: "2500.00",
      stockQuantity: 20,
      status: "ACTIVE",
    },
  });

  await prisma.product.create({
    data: {
      sku: "E2E-OOS-SKU",
      name: "E2E Out Of Stock Filter",
      slug: E2E_OUT_OF_STOCK_PRODUCT_SLUG,
      categoryId: category.id,
      purchasePrice: "200.00",
      retailPrice: "400.00",
      stockQuantity: 0,
      status: "ACTIVE",
    },
  });

  await prisma.product.create({
    data: {
      sku: E2E_POS_PRODUCT_SKU,
      name: "E2E POS Brake Fluid 1L",
      slug: "e2e-pos-brake-fluid",
      categoryId: category.id,
      purchasePrice: "400.00",
      retailPrice: "700.00",
      stockQuantity: 20,
      status: "ACTIVE",
    },
  });

  const orderProduct = await prisma.product.create({
    data: {
      sku: "E2E-ORDER-SKU",
      name: "E2E Order Test Filter",
      slug: "e2e-order-test-filter",
      categoryId: category.id,
      purchasePrice: "300.00",
      retailPrice: "600.00",
      stockQuantity: 20,
      status: "ACTIVE",
    },
  });

  await prisma.orderSequence.createMany({ data: [{ id: 1, nextValue: 90001 }], skipDuplicates: true });
  const sequence = await prisma.orderSequence.update({ where: { id: 1 }, data: { nextValue: { increment: 1 } } });
  const orderNumber = `UOT-${sequence.nextValue - 1}`;
  if (orderNumber !== E2E_SEEDED_ORDER_NUMBER) {
    throw new Error(`Expected to seed ${E2E_SEEDED_ORDER_NUMBER} but got ${orderNumber} — is the test DB not fresh?`);
  }

  const customer = await prisma.customer.create({
    data: { name: "E2E Test Customer", phone: "03009999999", address: "Test address, Kot Samaba" },
  });

  await prisma.order.create({
    data: {
      orderNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      websiteSubtotal: "600.00",
      status: "NEW",
      paymentStatus: "PENDING",
      items: {
        create: [
          {
            productId: orderProduct.id,
            productName: orderProduct.name,
            quantity: 1,
            unitPrice: "600.00",
            lineTotal: "600.00",
            unitCost: "300.00",
          },
        ],
      },
    },
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
