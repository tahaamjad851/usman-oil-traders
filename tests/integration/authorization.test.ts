import { describe, expect, it } from "vitest";

import { getProduct } from "@/lib/services/product.service";
import { listExpenses } from "@/lib/services/expense.service";
import { ForbiddenError } from "@/lib/auth/guard";
import { createTestProduct, createTestUser } from "./fixtures";

// Every phase so far has relied on requireRole/requireAnyRole being called correctly inside each
// service, verified only against mocked Prisma clients. This file re-runs the highest-stakes half
// of that guarantee — STAFF never receiving purchasePrice, and STAFF never reaching an
// admin-only service — against a real database round trip, not a stand-in object.
describe("Authorization boundaries hold against a real database (Phase 14)", () => {
  it("STAFF never receives purchasePrice in a real product row, even though the raw row has it", async () => {
    const staff = await createTestUser("STAFF");
    const admin = await createTestUser("SUPER_ADMIN");
    const product = await createTestProduct({ stockQuantity: 5 });

    const staffView = await getProduct(staff, product.id);
    expect(staffView).not.toHaveProperty("purchasePrice");

    const adminView = await getProduct(admin, product.id);
    expect(adminView).toHaveProperty("purchasePrice");

    const publicView = await getProduct(null, product.id);
    expect(publicView).not.toHaveProperty("purchasePrice");
  });

  it("STAFF is rejected by the expenses service before any query executes", async () => {
    const staff = await createTestUser("STAFF");
    await expect(listExpenses(staff, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
