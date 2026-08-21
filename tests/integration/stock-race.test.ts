import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createLocalSale } from "@/lib/services/local-sale.service";
import { createOrder, updateOrderStatus } from "@/lib/services/order.service";
import { ValidationError } from "@/lib/auth/guard";
import { createTestProduct, createTestUser } from "./fixtures";

// This is the one test in the whole suite that a fully-mocked Prisma client cannot meaningfully
// perform: it fires two real, concurrent transactions at a real Postgres server and checks that
// the database's own row-level locking — not application-level luck — is what prevents two sales
// from both claiming the same last unit of stock. See lib/services/local-sale.service.ts and
// order.service.ts's updateOrderStatus: both decrement stock with a single atomic
// `{ decrement: n }` update inside a transaction, then check the *result* for negative stock and
// roll back if it went negative without an explicit override — never a separate read-then-write.
describe("Concurrent stock claims on a real database (Phase 14)", () => {
  it("only one of two simultaneous POS sales for the last unit succeeds", async () => {
    const staff = await createTestUser("STAFF");
    const product = await createTestProduct({ stockQuantity: 1 });

    const sale = (paymentMethod: "CASH" | "JAZZCASH") =>
      createLocalSale(staff, {
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod,
      });

    const results = await Promise.allSettled([sale("CASH"), sale("JAZZCASH")]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(finalProduct.stockQuantity).toBe(0);
  });

  it("a POS sale racing a staff order-confirmation for the last unit: exactly one wins", async () => {
    const staff = await createTestUser("STAFF");
    const admin = await createTestUser("SUPER_ADMIN");
    const product = await createTestProduct({ stockQuantity: 1 });

    const order = await createOrder({
      customerName: "Race Test Customer",
      customerPhone: "03001234567",
      customerAddress: "Test address",
      items: [{ productId: product.id, quantity: 1 }],
    });

    const confirmOrder = updateOrderStatus(admin, order.id, { status: "PRICE_CONFIRMED" });
    const posSale = createLocalSale(staff, {
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "CASH",
    });

    const results = await Promise.allSettled([confirmOrder, posSale]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(finalProduct.stockQuantity).toBe(0);
  });
});
