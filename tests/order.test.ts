import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  createOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  type TransactionalOrderCreateClient,
  type TransactionalOrderStatusClient,
} from "@/lib/services/order.service";
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

const validOrderInput = {
  customerName: "Ali Khan",
  customerPhone: "03001234567",
  items: [{ productId: productA.id, quantity: 2 }],
};

function fakeOrderCreateClient(products: typeof productA[] = [productA]) {
  const orderCreateArgs: Record<string, unknown>[] = [];

  const client: TransactionalOrderCreateClient = {
    product: {
      findMany: vi.fn(async () => products),
    },
    customer: {
      upsert: vi.fn(async () => ({ id: "customer-1" })),
    },
    orderSequence: {
      upsert: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({ nextValue: 10002 })),
    },
    order: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        orderCreateArgs.push(args.data);
        const items =
          (args.data.items as { create: Array<{ productName: string; quantity: number }> } | undefined)
            ?.create ?? [];
        return {
          id: "order-1",
          orderNumber: "UOT-10001",
          ...args.data,
          items,
        };
      }),
    },
    $transaction: async (fn) => fn(client),
  };

  return { client, orderCreateArgs };
}

describe("createOrder", () => {
  it("rejects a duplicate product in the cart", async () => {
    const { client } = fakeOrderCreateClient();
    const input = { ...validOrderInput, items: [{ productId: productA.id, quantity: 1 }, { productId: productA.id, quantity: 1 }] };
    await expect(createOrder(input, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an order referencing an unknown product", async () => {
    const { client } = fakeOrderCreateClient([]);
    await expect(createOrder(validOrderInput, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an OUT_OF_STOCK item (zero stock)", async () => {
    const { client } = fakeOrderCreateClient([{ ...productA, stockQuantity: 0 }]);
    await expect(createOrder(validOrderInput, client)).rejects.toThrow(/out of stock/i);
  });

  it("allows a LOW_STOCK item (some stock, below minimum) through", async () => {
    const { client } = fakeOrderCreateClient([{ ...productA, stockQuantity: 2 }]);
    await expect(createOrder(validOrderInput, client)).resolves.toBeDefined();
  });

  it("snapshots unitPrice from the current Product.retailPrice, not a client-supplied price", async () => {
    const { client, orderCreateArgs } = fakeOrderCreateClient();
    await createOrder(validOrderInput, client);

    const items = orderCreateArgs[0].items as { create: Array<{ unitPrice: string; lineTotal: string }> };
    expect(items.create[0].unitPrice).toBe(productA.retailPrice);
    expect(items.create[0].lineTotal).toBe("6000.00");
    expect(orderCreateArgs[0].websiteSubtotal).toBe("6000.00");
  });

  it("snapshots unitCost (cost basis, Phase 12) from Product.purchasePrice at creation, but never returns it", async () => {
    const { client, orderCreateArgs } = fakeOrderCreateClient();
    const order = await createOrder(validOrderInput, client);

    const items = orderCreateArgs[0].items as { create: Array<{ unitCost: string }> };
    expect(items.create[0].unitCost).toBe(productA.purchasePrice);

    for (const item of order.items) {
      expect(item).not.toHaveProperty("unitCost");
    }
  });

  it("creates the order as NEW / PENDING and finds-or-creates the customer by phone", async () => {
    const { client, orderCreateArgs } = fakeOrderCreateClient();
    await createOrder(validOrderInput, client);

    expect(orderCreateArgs[0]).toMatchObject({ status: "NEW", paymentStatus: "PENDING" });
    expect(client.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: validOrderInput.customerPhone } }),
    );
  });

  it("never touches stock or the inventory ledger at creation — only customer/orderSequence/order are called", async () => {
    // TransactionalOrderCreateClient's type doesn't even expose product.update or
    // inventoryTransaction.create, so this is enforced at compile time too; this test just
    // confirms the only client calls made are the ones stock-neutral order creation needs.
    const { client } = fakeOrderCreateClient();
    await createOrder(validOrderInput, client);

    expect(client.product.findMany).toHaveBeenCalledTimes(1);
    expect(client.customer.upsert).toHaveBeenCalledTimes(1);
    expect(client.order.create).toHaveBeenCalledTimes(1);
  });
});

function fakeOrderStatusClient(order: {
  id: string;
  orderNumber: string;
  status: string;
  confirmedById: string | null;
  finalProductAmount?: unknown;
  deliveryCharge?: unknown;
  discount?: unknown;
  websiteSubtotal: unknown;
  items: Array<{ productId: string; productName: string; quantity: number }>;
}) {
  let currentOrder = { ...order };
  const stockByProduct = new Map(order.items.map((item, index) => [item.productId, 10 - index]));
  const inventoryTxns: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];
  const orderUpdates: Record<string, unknown>[] = [];

  const client: TransactionalOrderStatusClient = {
    order: {
      // Mutable, unlike the other fake clients in this file — this one specifically supports
      // multiple sequential updateOrderStatus() calls in a single test observing each other's
      // effects (see the backward-transition test), which a frozen closure snapshot can't do.
      findUniqueOrThrow: vi.fn(async () => currentOrder),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        orderUpdates.push(args.data);
        currentOrder = { ...currentOrder, ...args.data };
        return currentOrder;
      }),
    },
    product: {
      update: vi.fn(async (args: { where: { id: string }; data: { stockQuantity: { increment: number } | { decrement: number } } }) => {
        const current = stockByProduct.get(args.where.id) ?? 0;
        const delta = "increment" in args.data.stockQuantity ? args.data.stockQuantity.increment : -args.data.stockQuantity.decrement;
        const next = current + delta;
        stockByProduct.set(args.where.id, next);
        return { id: args.where.id, stockQuantity: next };
      }),
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

  return {
    client,
    inventoryTxns,
    auditLogs,
    orderUpdates,
    getStock: (productId: string) => stockByProduct.get(productId),
  };
}

const baseOrder = {
  id: "order-1",
  orderNumber: "UOT-10001",
  confirmedById: null,
  websiteSubtotal: "6000.00",
  items: [{ productId: productA.id, productName: productA.name, quantity: 2 }],
};

describe("updateOrderStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects staff and admin equally when neither is a recognized role", async () => {
    const outsider = { ...staff, role: "GUEST" as never };
    const { client } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await expect(updateOrderStatus(outsider, "order-1", { status: "WHATSAPP_CONTACTED" }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("allows STAFF to change order status (not just SUPER_ADMIN)", async () => {
    const { client } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await expect(
      updateOrderStatus(staff, "order-1", { status: "WHATSAPP_CONTACTED" }, client),
    ).resolves.toBeDefined();
  });

  it("does NOT touch stock or write an InventoryTransaction for a pre-confirmation transition", async () => {
    const { client, inventoryTxns } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await updateOrderStatus(admin, "order-1", { status: "WHATSAPP_CONTACTED" }, client);

    expect(client.product.update).not.toHaveBeenCalled();
    expect(inventoryTxns).toHaveLength(0);
  });

  it("deducts stock and writes a WEBSITE_ORDER InventoryTransaction when confirming (NEW -> PRICE_CONFIRMED)", async () => {
    const { client, inventoryTxns, getStock, orderUpdates } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED" }, client);

    expect(getStock(productA.id)).toBe(10 - 2);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({
      type: "WEBSITE_ORDER",
      quantityDelta: -2,
      resultingQty: 8,
      orderId: "order-1",
      performedById: "admin-1",
    });
    expect(orderUpdates[0]).toMatchObject({ status: "PRICE_CONFIRMED", confirmedById: "admin-1" });
  });

  it("restores stock and writes an ORDER_CANCELLATION InventoryTransaction when cancelling an already-confirmed order", async () => {
    const { client, inventoryTxns, getStock } = fakeOrderStatusClient({ ...baseOrder, status: "PRICE_CONFIRMED" });
    await updateOrderStatus(admin, "order-1", { status: "CANCELLED" }, client);

    expect(getStock(productA.id)).toBe(10 + 2);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({ type: "ORDER_CANCELLATION", quantityDelta: 2, orderId: "order-1" });
  });

  it("restores stock exactly once when moved backward to a pre-PRICE_CONFIRMED status (not just via CANCELLED)", async () => {
    // Prerequisite fix for Phase 10: previously only an explicit CANCELLED transition restored
    // stock; moving a confirmed order backward to e.g. WHATSAPP_CONTACTED (a corrected mistake,
    // a re-negotiation) left stock silently decremented forever. Confirm, then move backward, and
    // confirm the restore happened exactly once.
    const { client, inventoryTxns, getStock } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });

    await updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED" }, client);
    expect(getStock(productA.id)).toBe(10 - 2);
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({ type: "WEBSITE_ORDER", quantityDelta: -2 });

    await updateOrderStatus(admin, "order-1", { status: "WHATSAPP_CONTACTED" }, client);
    expect(getStock(productA.id)).toBe(10); // restored back to the original level, exactly once
    expect(inventoryTxns).toHaveLength(2);
    expect(inventoryTxns[1]).toMatchObject({ type: "ORDER_CANCELLATION", quantityDelta: 2, orderId: "order-1" });

    // A further forward-then-forward move between two committed statuses must not touch stock —
    // both are already "committed", so no restore, no re-decrement.
    await updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED" }, client);
    await updateOrderStatus(admin, "order-1", { status: "PAYMENT_PENDING" }, client);
    expect(inventoryTxns).toHaveLength(3); // only the second PRICE_CONFIRMED re-decrement, not a 4th row
  });

  it("cancelling a never-confirmed order touches no stock at all", async () => {
    const { client, inventoryTxns } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await updateOrderStatus(admin, "order-1", { status: "CANCELLED" }, client);

    expect(client.product.update).not.toHaveBeenCalled();
    expect(inventoryTxns).toHaveLength(0);
  });

  it("rejects further changes to an already-CANCELLED order", async () => {
    const { client } = fakeOrderStatusClient({ ...baseOrder, status: "CANCELLED" });
    await expect(updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED" }, client)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects changing a DELIVERED order to anything else", async () => {
    const { client } = fakeOrderStatusClient({ ...baseOrder, status: "DELIVERED" });
    await expect(updateOrderStatus(admin, "order-1", { status: "CANCELLED" }, client)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("blocks confirming past zero stock without allowNegativeStock", async () => {
    const order = { ...baseOrder, status: "NEW", items: [{ productId: productA.id, productName: productA.name, quantity: 50 }] };
    const { client, inventoryTxns } = fakeOrderStatusClient(order);

    await expect(updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED" }, client)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(inventoryTxns).toHaveLength(0);
  });

  it("allows confirming past zero stock with allowNegativeStock, and logs a warning", async () => {
    const order = { ...baseOrder, status: "NEW", items: [{ productId: productA.id, productName: productA.name, quantity: 50 }] };
    const { client, getStock } = fakeOrderStatusClient(order);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateOrderStatus(admin, "order-1", { status: "PRICE_CONFIRMED", allowNegativeStock: true }, client);

    expect(getStock(productA.id)).toBeLessThan(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("writes an ORDER_STATUS_CHANGED audit entry with before/after status", async () => {
    const { client, auditLogs } = fakeOrderStatusClient({ ...baseOrder, status: "NEW" });
    await updateOrderStatus(admin, "order-1", { status: "WHATSAPP_CONTACTED" }, client);

    expect(auditLogs[0]).toMatchObject({
      action: "ORDER_STATUS_CHANGED",
      previousValue: { status: "NEW" },
      newValue: { status: "WHATSAPP_CONTACTED" },
    });
  });
});

describe("listOrders / getOrder", () => {
  it("never joins the related Product (the only path that could leak purchasePrice)", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);
    await listOrders(staff, { page: 1, pageSize: 24 }, { findMany, count });

    const call = findMany.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(call.include).toEqual({ items: true });
  });

  it("is available to both STAFF and SUPER_ADMIN", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    await expect(listOrders(staff, { page: 1, pageSize: 24 }, { findMany, count })).resolves.toBeDefined();
    await expect(listOrders(admin, { page: 1, pageSize: 24 }, { findMany, count })).resolves.toBeDefined();
  });

  it("getOrder includes items and payments, never the product relation", async () => {
    const findUniqueOrThrow = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return { id: "order-1", items: [] };
    });
    await getOrder(staff, "order-1", { findUniqueOrThrow });

    const call = findUniqueOrThrow.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(call.include).toEqual({ items: true, payments: true });
  });
});
