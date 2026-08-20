import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  createLocalSale,
  getLocalSale,
  listLocalSales,
  type TransactionalLocalSaleClient,
} from "@/lib/services/local-sale.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const productA = {
  id: "cl00000000000000000000a",
  name: "ZIC X7 5W-30",
  status: "ACTIVE",
  stockQuantity: 10,
  retailPrice: "3000.00",
  purchasePrice: "2200.00",
};

const validSaleInput = {
  items: [{ productId: productA.id, quantity: 2 }],
  paymentMethod: "CASH" as const,
  amountTendered: "10000.00",
};

function fakeLocalSaleClient(products: typeof productA[] = [productA], startingStock = 10) {
  const stockByProduct = new Map(products.map((product) => [product.id, startingStock]));
  const inventoryTxns: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const customerUpsertArgs: Record<string, unknown>[] = [];

  const client: TransactionalLocalSaleClient = {
    product: {
      findMany: vi.fn(async () => products),
      update: vi.fn(async (args: { where: { id: string }; data: { stockQuantity: { decrement: number } } }) => {
        const current = stockByProduct.get(args.where.id) ?? 0;
        const next = current - args.data.stockQuantity.decrement;
        stockByProduct.set(args.where.id, next);
        return { id: args.where.id, stockQuantity: next };
      }),
    },
    customer: {
      upsert: vi.fn(async (args: Record<string, unknown>) => {
        customerUpsertArgs.push(args);
        return { id: "customer-1" };
      }),
    },
    localSaleSequence: {
      upsert: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({ nextValue: 2 })),
    },
    localSale: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const items =
          (args.data.items as { create: Array<{ productId: string; productName: string; quantity: number }> })
            .create;
        return {
          id: "sale-1",
          saleNumber: "LS-1",
          items: items.map((item, index) => ({ id: `item-${index}`, ...item })),
        };
      }),
    },
    inventoryTransaction: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        inventoryTxns.push(args.data);
        return args.data;
      }),
    },
    payment: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        payments.push(args.data);
        return { id: "payment-1", ...args.data };
      }),
    },
    $transaction: async (fn) => fn(client),
  };

  return { client, inventoryTxns, payments, customerUpsertArgs, getStock: (id: string) => stockByProduct.get(id) };
}

describe("createLocalSale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows both STAFF and SUPER_ADMIN to ring up a sale", async () => {
    const forStaff = fakeLocalSaleClient();
    const forAdmin = fakeLocalSaleClient();
    await expect(createLocalSale(staff, validSaleInput, forStaff.client)).resolves.toBeDefined();
    await expect(createLocalSale(admin, validSaleInput, forAdmin.client)).resolves.toBeDefined();
  });

  it("rejects a sale with no items", async () => {
    const { client } = fakeLocalSaleClient();
    await expect(createLocalSale(staff, { ...validSaleInput, items: [] }, client)).rejects.toThrow();
  });

  it("rejects a duplicate product on the ticket", async () => {
    const { client } = fakeLocalSaleClient();
    const input = { ...validSaleInput, items: [{ productId: productA.id, quantity: 1 }, { productId: productA.id, quantity: 1 }] };
    await expect(createLocalSale(staff, input, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown product", async () => {
    const { client } = fakeLocalSaleClient([]);
    await expect(createLocalSale(staff, validSaleInput, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a discontinued product", async () => {
    const { client } = fakeLocalSaleClient([{ ...productA, status: "DISCONTINUED" }]);
    await expect(createLocalSale(staff, validSaleInput, client)).rejects.toThrow(/discontinued/i);
  });

  it("rejects amountTendered less than the sale total", async () => {
    const { client } = fakeLocalSaleClient();
    await expect(
      createLocalSale(staff, { ...validSaleInput, amountTendered: "100.00" }, client),
    ).rejects.toThrow(/less than/i);
  });

  it("end-to-end: decrements stock and writes a matching LOCAL_SALE StockMovement in the same transaction", async () => {
    const { client, inventoryTxns, getStock } = fakeLocalSaleClient([productA], 10);

    const sale = await createLocalSale(staff, validSaleInput, client);

    expect(getStock(productA.id)).toBe(8);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({
      type: "LOCAL_SALE",
      quantityDelta: -2,
      resultingQty: 8,
      localSaleId: "sale-1",
      performedById: "staff-1",
    });
    expect(sale.payment).toMatchObject({ amount: "6000.00", method: "CASH" });
  });

  it("blocks a sale that would take stock negative without allowNegativeStock", async () => {
    const { client, inventoryTxns } = fakeLocalSaleClient([productA], 1);
    await expect(
      createLocalSale(
        staff,
        { items: [{ productId: productA.id, quantity: 5 }], paymentMethod: "CASH", amountTendered: "15000.00" },
        client,
      ),
    ).rejects.toThrow(/stock/i);
    expect(inventoryTxns).toHaveLength(0);
  });

  it("allows a sale to take stock negative with allowNegativeStock, and logs a warning", async () => {
    const { client, getStock } = fakeLocalSaleClient([productA], 1);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await createLocalSale(
      staff,
      {
        items: [{ productId: productA.id, quantity: 5 }],
        paymentMethod: "CASH",
        amountTendered: "15000.00",
        allowNegativeStock: true,
      },
      client,
    );

    expect(getStock(productA.id)).toBeLessThan(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("finds-or-creates a Customer by phone when one is given, but stays anonymous when it isn't", async () => {
    const withPhone = fakeLocalSaleClient();
    await createLocalSale(staff, { ...validSaleInput, customerName: "Ali", customerPhone: "03001234567" }, withPhone.client);
    expect(withPhone.customerUpsertArgs).toHaveLength(1);

    const anonymous = fakeLocalSaleClient();
    await createLocalSale(staff, validSaleInput, anonymous.client);
    expect(anonymous.customerUpsertArgs).toHaveLength(0);
  });

  it("snapshots unitPrice from the current Product.retailPrice", async () => {
    const { client } = fakeLocalSaleClient();
    const sale = await createLocalSale(staff, validSaleInput, client);
    const items = sale.items as unknown as Array<{ unitPrice: string; lineTotal: string }>;
    expect(items[0].unitPrice).toBe(productA.retailPrice);
    expect(items[0].lineTotal).toBe("6000.00");
  });

  it("snapshots unitCost (cost basis, Phase 12) from Product.purchasePrice at sale time, but never returns it", async () => {
    const { client } = fakeLocalSaleClient();
    const sale = await createLocalSale(staff, validSaleInput, client);

    const createCall = (client.localSale.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { items: { create: Array<{ unitCost: string }> } };
    };
    expect(createCall.data.items.create[0].unitCost).toBe(productA.purchasePrice);

    for (const item of sale.items) {
      expect(item).not.toHaveProperty("unitCost");
    }
  });
});

describe("listLocalSales / getLocalSale", () => {
  it("scopes STAFF to their own sales; SUPER_ADMIN sees everyone's", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);

    await listLocalSales(staff, { page: 1, pageSize: 24 }, { findMany, count });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { soldById: "staff-1" } });

    await listLocalSales(admin, { page: 1, pageSize: 24 }, { findMany, count });
    expect(findMany.mock.calls[1][0]).toMatchObject({ where: {} });
  });

  it("never joins the related Product (the only path that could leak purchasePrice)", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);
    await listLocalSales(staff, { page: 1, pageSize: 24 }, { findMany, count });

    const call = findMany.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(call.include).not.toHaveProperty("items.include");
    expect(JSON.stringify(call.include)).not.toContain("product");
  });

  it("getLocalSale lets a SUPER_ADMIN open any sale, but blocks STAFF from opening another staff member's sale", async () => {
    const findUniqueOrThrow = vi.fn(async () => ({ id: "sale-1", soldById: "someone-else", items: [] }));

    await expect(getLocalSale(admin, "sale-1", { findUniqueOrThrow })).resolves.toBeDefined();
    await expect(getLocalSale(staff, "sale-1", { findUniqueOrThrow })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("getLocalSale lets STAFF open their own sale", async () => {
    const findUniqueOrThrow = vi.fn(async () => ({ id: "sale-1", soldById: "staff-1", items: [] }));
    await expect(getLocalSale(staff, "sale-1", { findUniqueOrThrow })).resolves.toBeDefined();
  });
});
