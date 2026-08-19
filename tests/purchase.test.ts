import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import { createPurchase, type TransactionalPurchaseClient } from "@/lib/services/purchase.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const validPurchase = {
  supplierId: "cl000000000000000000001",
  purchaseDate: "2026-08-01",
  items: [{ productId: "cl000000000000000000002", quantity: 10, unitCost: "2100.00" }],
};

function fakePurchaseClient(products: Array<{ id: string; name: string; status: string }>) {
  let stock = 5;
  const inventoryTxns: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const client: TransactionalPurchaseClient = {
    product: {
      findMany: vi.fn(async () => products),
      update: vi.fn(async (args: { where: { id: string }; data: { stockQuantity: { increment: number } } }) => {
        stock += args.data.stockQuantity.increment;
        return { id: args.where.id, stockQuantity: stock };
      }),
    },
    purchase: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        ...args.data,
        id: "purchase-1",
        items: (validPurchase.items as Array<{ productId: string; quantity: number }>).map((item, index) => ({
          id: `item-${index}`,
          productId: item.productId,
          quantity: item.quantity,
        })),
      })),
    },
    inventoryTransaction: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        inventoryTxns.push(args.data);
        return args.data;
      }),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        auditLogs.push(args.data);
        return args.data;
      }),
    },
    $transaction: async (fn) => fn(client),
  };

  return { client, inventoryTxns, auditLogs, getStock: () => stock };
}

describe("createPurchase", () => {
  it("rejects staff — purchase entry (and the cost data it carries) is SUPER_ADMIN-only", async () => {
    const { client } = fakePurchaseClient([{ id: validPurchase.items[0].productId, name: "Oil", status: "ACTIVE" }]);
    await expect(createPurchase(staff, validPurchase, client)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a purchase referencing an unknown product", async () => {
    const { client } = fakePurchaseClient([]);
    await expect(createPurchase(admin, validPurchase, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a purchase against a DISCONTINUED product", async () => {
    const { client } = fakePurchaseClient([
      { id: validPurchase.items[0].productId, name: "Old Oil", status: "DISCONTINUED" },
    ]);
    await expect(createPurchase(admin, validPurchase, client)).rejects.toThrow(/discontinued/i);
  });

  it("rejects duplicate product lines in the same purchase", async () => {
    const { client } = fakePurchaseClient([{ id: validPurchase.items[0].productId, name: "Oil", status: "ACTIVE" }]);
    const dupe = {
      ...validPurchase,
      items: [validPurchase.items[0], { ...validPurchase.items[0], quantity: 1 }],
    };
    await expect(createPurchase(admin, dupe, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("increments stock for every line item and writes a matching PURCHASE ledger row", async () => {
    const { client, inventoryTxns, getStock } = fakePurchaseClient([
      { id: validPurchase.items[0].productId, name: "Oil", status: "ACTIVE" },
    ]);

    const before = getStock();
    await createPurchase(admin, validPurchase, client);

    expect(getStock()).toBe(before + 10);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({
      type: "PURCHASE",
      quantityDelta: 10,
      resultingQty: before + 10,
      purchaseId: "purchase-1",
      performedById: "admin-1",
    });
  });

  it("writes a PURCHASE_RECORDED audit entry", async () => {
    const { client, auditLogs } = fakePurchaseClient([
      { id: validPurchase.items[0].productId, name: "Oil", status: "ACTIVE" },
    ]);

    await createPurchase(admin, validPurchase, client);

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({ action: "PURCHASE_RECORDED", entityType: "Purchase" });
  });

  it("snapshots unitCost onto the purchase — it is not read back from the current Product.purchasePrice", async () => {
    const { client } = fakePurchaseClient([{ id: validPurchase.items[0].productId, name: "Oil", status: "ACTIVE" }]);

    await createPurchase(admin, validPurchase, client);

    const createCall = (client.purchase.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { items: { create: Array<{ unitCost: string }> } };
    };
    expect(createCall.data.items.create[0].unitCost).toBe("2100.00");
  });
});
