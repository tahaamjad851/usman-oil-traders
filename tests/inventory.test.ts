import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/auth/guard";
import {
  adjustStock,
  getLowStockReport,
  listInventoryTransactions,
  type TransactionalStockClient,
} from "@/lib/services/inventory.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

function fakeStockClient(startingQty: number) {
  let qty = startingQty;
  const inventoryTxns: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const update = vi.fn(async (args: { where: { id: string }; data: { stockQuantity: { increment: number } } }) => {
    qty += args.data.stockQuantity.increment;
    return { id: args.where.id, stockQuantity: qty };
  });

  const client: TransactionalStockClient = {
    product: { update },
    inventoryTransaction: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        inventoryTxns.push(args.data);
        return { id: `txn-${inventoryTxns.length}` };
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

  return { client, inventoryTxns, auditLogs, getQty: () => qty };
}

describe("adjustStock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("increments stock atomically and records a StockMovement (InventoryTransaction) row", async () => {
    const { client, inventoryTxns, getQty } = fakeStockClient(10);

    const result = await adjustStock(
      admin,
      "product-1",
      { type: "MANUAL_ADJUSTMENT", quantityDelta: 5, reason: "Recount found extra stock" },
      client,
    );

    expect(getQty()).toBe(15);
    expect(result.product.stockQuantity).toBe(15);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({
      type: "MANUAL_ADJUSTMENT",
      quantityDelta: 5,
      resultingQty: 15,
      reason: "Recount found extra stock",
    });
  });

  it("logs who performed the adjustment in the audit trail", async () => {
    const { client, auditLogs } = fakeStockClient(10);

    await adjustStock(staff, "product-1", { quantityDelta: -2, reason: "Two units damaged in storage" }, client);

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({ userId: "staff-1", action: "STOCK_ADJUSTED" });
  });

  it("allows both SUPER_ADMIN and STAFF to adjust stock", async () => {
    const forAdmin = fakeStockClient(10);
    const forStaff = fakeStockClient(10);
    await expect(
      adjustStock(admin, "product-1", { quantityDelta: 1, reason: "Recount" }, forAdmin.client),
    ).resolves.toBeDefined();
    await expect(
      adjustStock(staff, "product-1", { quantityDelta: 1, reason: "Recount" }, forStaff.client),
    ).resolves.toBeDefined();
  });

  it("refuses to take stock negative without allowNegative, and rolls back (no ledger row written)", async () => {
    const { client, inventoryTxns, auditLogs } = fakeStockClient(3);

    await expect(
      adjustStock(admin, "product-1", { quantityDelta: -5, reason: "Damaged in transit" }, client),
    ).rejects.toBeInstanceOf(ValidationError);

    // The fake client doesn't simulate real DB rollback (a real Postgres transaction would undo
    // the increment above too), but the ledger/audit writes that follow the negative-stock check
    // must never execute once it throws.
    expect(inventoryTxns).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
  });

  it("allows going negative with an explicit override and logs a warning", async () => {
    const { client, inventoryTxns, auditLogs } = fakeStockClient(3);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await adjustStock(
      admin,
      "product-1",
      { quantityDelta: -5, reason: "Emergency sale, correcting later", allowNegative: true },
      client,
    );

    expect(result.product.stockQuantity).toBe(-2);
    expect(inventoryTxns[0]).toMatchObject({ resultingQty: -2 });
    expect(auditLogs[0].newValue).toMatchObject({ negativeOverride: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a zero quantityDelta and a missing reason via validation", async () => {
    const { client } = fakeStockClient(10);
    await expect(adjustStock(admin, "product-1", { quantityDelta: 0, reason: "test" }, client)).rejects.toThrow();
    await expect(adjustStock(admin, "product-1", { quantityDelta: 1, reason: "" }, client)).rejects.toThrow();
  });

  // TRANSFER was never wired to any real multi-branch behavior and has been scaffolding-only —
  // removed from the set a new adjustment can use. It stays in the Prisma enum for historical
  // rows, so this only asserts new submissions are rejected, not that the value is gone entirely.
  it("rejects TRANSFER as a manual adjustment type", async () => {
    const { client } = fakeStockClient(10);
    await expect(
      adjustStock(admin, "product-1", { type: "TRANSFER", quantityDelta: 1, reason: "test" }, client),
    ).rejects.toThrow();
  });
});

describe("listInventoryTransactions", () => {
  it("never selects the related Purchase (the only path that could leak unitCost)", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);

    await listInventoryTransactions(staff, { page: 1, pageSize: 50 }, { findMany, count });

    const call = findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(call.select).not.toHaveProperty("purchase");
    expect(Object.keys(call.select)).not.toContain("purchase");
  });

  it("is available to both roles", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    await expect(
      listInventoryTransactions(staff, { page: 1, pageSize: 50 }, { findMany, count }),
    ).resolves.toBeDefined();
    await expect(
      listInventoryTransactions(admin, { page: 1, pageSize: 50 }, { findMany, count }),
    ).resolves.toBeDefined();
  });
});

describe("getLowStockReport", () => {
  const rows = [
    {
      id: "product-1",
      sku: "ZIC-5W30",
      name: "ZIC X7 5W-30",
      purchasePrice: "2200.00",
      retailPrice: "3000.00",
      stockQuantity: 2,
      minimumStock: 5,
    },
  ];

  it("returns products at or below their minimum stock", async () => {
    const fetchRows = vi.fn(async () => rows);
    const fetchCount = vi.fn(async () => 1);

    const result = await getLowStockReport(admin, { page: 1, pageSize: 50 }, { fetchRows, fetchCount });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: "product-1", stockQuantity: 2, minimumStock: 5 });
  });

  it("strips purchasePrice for STAFF but keeps it for SUPER_ADMIN", async () => {
    const fetchRows = vi.fn(async () => rows);
    const fetchCount = vi.fn(async () => 1);

    const staffResult = await getLowStockReport(staff, { page: 1, pageSize: 50 }, { fetchRows, fetchCount });
    expect(staffResult.items[0]).not.toHaveProperty("purchasePrice");

    const adminResult = await getLowStockReport(admin, { page: 1, pageSize: 50 }, { fetchRows, fetchCount });
    expect(adminResult.items[0]).toHaveProperty("purchasePrice", "2200.00");
  });

  it("passes pagination through to the fetcher", async () => {
    const fetchRows = vi.fn(async () => []);
    const fetchCount = vi.fn(async () => 0);

    await getLowStockReport(admin, { page: 3, pageSize: 10 }, { fetchRows, fetchCount });

    expect(fetchRows).toHaveBeenCalledWith(10, 20);
  });
});
