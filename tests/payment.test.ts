import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  computeOrderPaymentSummary,
  listUnifiedPayments,
  recordOrderPayment,
  voidPayment,
  type TransactionalOrderPaymentClient,
  type TransactionalPaymentVoidClient,
} from "@/lib/services/payment.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

describe("computeOrderPaymentSummary", () => {
  it("reports UNCONFIRMED when the order has no finalConfirmedAmount yet", () => {
    const summary = computeOrderPaymentSummary({ finalConfirmedAmount: null, payments: [] });
    expect(summary).toMatchObject({ status: "UNCONFIRMED", confirmedTotal: null, remaining: null });
  });

  it("reports UNPAID when confirmed but nothing has been paid", () => {
    const summary = computeOrderPaymentSummary({ finalConfirmedAmount: "5000.00", payments: [] });
    expect(summary).toMatchObject({ status: "UNPAID", confirmedTotal: 5000, totalPaid: 0, remaining: 5000 });
  });

  it("reports PARTIALLY_PAID when some but not all has been paid", () => {
    const summary = computeOrderPaymentSummary({
      finalConfirmedAmount: "5000.00",
      payments: [{ amount: "2000.00", status: "RECEIVED", voidedAt: null }],
    });
    expect(summary).toMatchObject({ status: "PARTIALLY_PAID", totalPaid: 2000, remaining: 3000 });
  });

  it("reports FULLY_PAID once payments cover the confirmed total", () => {
    const summary = computeOrderPaymentSummary({
      finalConfirmedAmount: "5000.00",
      payments: [
        { amount: "2000.00", status: "RECEIVED", voidedAt: null },
        { amount: "3000.00", status: "RECEIVED", voidedAt: null },
      ],
    });
    expect(summary).toMatchObject({ status: "FULLY_PAID", totalPaid: 5000, remaining: 0 });
  });

  it("excludes voided payments from the paid total", () => {
    const summary = computeOrderPaymentSummary({
      finalConfirmedAmount: "5000.00",
      payments: [
        { amount: "5000.00", status: "RECEIVED", voidedAt: new Date() },
        { amount: "1000.00", status: "RECEIVED", voidedAt: null },
      ],
    });
    expect(summary).toMatchObject({ status: "PARTIALLY_PAID", totalPaid: 1000 });
  });

  it("excludes non-RECEIVED payment rows from the paid total", () => {
    const summary = computeOrderPaymentSummary({
      finalConfirmedAmount: "5000.00",
      payments: [{ amount: "5000.00", status: "PENDING", voidedAt: null }],
    });
    expect(summary).toMatchObject({ status: "UNPAID", totalPaid: 0 });
  });
});

function fakeOrderPaymentClient(order: {
  id: string;
  status: string;
  customerId: string;
  finalConfirmedAmount: unknown;
  payments: Array<{ amount: unknown; status: string; voidedAt: unknown }>;
}) {
  let currentOrder = { ...order };
  const paymentsCreated: Record<string, unknown>[] = [];
  const orderUpdates: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const client: TransactionalOrderPaymentClient = {
    order: {
      findUniqueOrThrow: vi.fn(async () => currentOrder),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        orderUpdates.push(args.data);
        currentOrder = { ...currentOrder, ...args.data } as typeof currentOrder;
        return currentOrder;
      }),
    },
    payment: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const record = { id: `payment-${paymentsCreated.length + 1}`, ...args.data };
        paymentsCreated.push(args.data);
        currentOrder = { ...currentOrder, payments: [...currentOrder.payments, args.data as never] };
        return record;
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

  return { client, paymentsCreated, orderUpdates, auditLogs };
}

const confirmedOrder = {
  id: "order-1",
  status: "PRICE_CONFIRMED",
  customerId: "customer-1",
  finalConfirmedAmount: "5000.00",
  payments: [] as Array<{ amount: unknown; status: string; voidedAt: unknown }>,
};

describe("recordOrderPayment", () => {
  it("allows both STAFF and SUPER_ADMIN to record a payment", async () => {
    const forStaff = fakeOrderPaymentClient({ ...confirmedOrder });
    const forAdmin = fakeOrderPaymentClient({ ...confirmedOrder });
    await expect(recordOrderPayment(staff, "order-1", { amount: "1000.00", method: "CASH" }, forStaff.client)).resolves.toBeDefined();
    await expect(recordOrderPayment(admin, "order-1", { amount: "1000.00", method: "CASH" }, forAdmin.client)).resolves.toBeDefined();
  });

  it("rejects a payment against an order with no confirmed amount yet", async () => {
    const { client } = fakeOrderPaymentClient({ ...confirmedOrder, finalConfirmedAmount: null });
    await expect(recordOrderPayment(staff, "order-1", { amount: "1000.00", method: "CASH" }, client)).rejects.toThrow(
      /confirm the final/i,
    );
  });

  it("rejects a payment against a cancelled order", async () => {
    const { client } = fakeOrderPaymentClient({ ...confirmedOrder, status: "CANCELLED" });
    await expect(recordOrderPayment(staff, "order-1", { amount: "1000.00", method: "CASH" }, client)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("accepts multiple partial payments that sum toward the confirmed total", async () => {
    const { client, orderUpdates } = fakeOrderPaymentClient({ ...confirmedOrder });

    await recordOrderPayment(staff, "order-1", { amount: "2000.00", method: "CASH" }, client);
    // First partial payment shouldn't mark the order fully paid.
    expect(orderUpdates).toHaveLength(0);

    await recordOrderPayment(staff, "order-1", { amount: "3000.00", method: "BANK_TRANSFER" }, client);
    // Second payment completes it — now it should auto-advance.
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]).toMatchObject({ paymentStatus: "RECEIVED", status: "PAYMENT_RECEIVED" });
  });

  it("rejects a payment that would overpay the order", async () => {
    const { client } = fakeOrderPaymentClient({ ...confirmedOrder });
    await expect(
      recordOrderPayment(staff, "order-1", { amount: "6000.00", method: "CASH" }, client),
    ).rejects.toThrow(/exceeds the remaining balance/i);
  });

  it("auto-advances PAYMENT_PENDING -> PAYMENT_RECEIVED once fully paid, but never from PROCESSING onward", async () => {
    const fromPending = fakeOrderPaymentClient({ ...confirmedOrder, status: "PAYMENT_PENDING" });
    await recordOrderPayment(admin, "order-1", { amount: "5000.00", method: "CASH" }, fromPending.client);
    expect(fromPending.orderUpdates[0]).toMatchObject({ status: "PAYMENT_RECEIVED" });

    const fromProcessing = fakeOrderPaymentClient({ ...confirmedOrder, status: "PROCESSING" });
    await recordOrderPayment(admin, "order-1", { amount: "5000.00", method: "CASH" }, fromProcessing.client);
    expect(fromProcessing.orderUpdates[0]).not.toHaveProperty("status");
    expect(fromProcessing.orderUpdates[0]).toMatchObject({ paymentStatus: "RECEIVED" });
  });

  it("writes a PAYMENT_RECORDED audit entry", async () => {
    const { client, auditLogs } = fakeOrderPaymentClient({ ...confirmedOrder });
    await recordOrderPayment(staff, "order-1", { amount: "1000.00", method: "CASH" }, client);
    expect(auditLogs[0]).toMatchObject({ action: "PAYMENT_RECORDED", entityType: "Order" });
  });
});

describe("voidPayment", () => {
  function fakeVoidClient(
    payment: { id: string; orderId: string | null; status: string; voidedAt: Date | null },
    order?: typeof confirmedOrder,
  ) {
    const paymentUpdates: Record<string, unknown>[] = [];
    const orderUpdates: Record<string, unknown>[] = [];
    const auditLogs: Record<string, unknown>[] = [];

    const client: TransactionalPaymentVoidClient = {
      payment: {
        findUniqueOrThrow: vi.fn(async () => payment),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          paymentUpdates.push(args.data);
          return { ...payment, ...args.data };
        }),
      },
      order: {
        findUnique: vi.fn(async () => order ?? null),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          orderUpdates.push(args.data);
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

    return { client, paymentUpdates, orderUpdates, auditLogs };
  }

  it("is SUPER_ADMIN only", async () => {
    const { client } = fakeVoidClient({ id: "payment-1", orderId: null, status: "RECEIVED", voidedAt: null });
    await expect(voidPayment(staff, "payment-1", { reason: "typo" }, client)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("marks the payment voided with a reason, without deleting it — the update call never removes the row", async () => {
    const { client, paymentUpdates, auditLogs } = fakeVoidClient({
      id: "payment-1",
      orderId: null,
      status: "RECEIVED",
      voidedAt: null,
    });

    await voidPayment(admin, "payment-1", { reason: "Entered wrong amount" }, client);

    expect(paymentUpdates[0]).toMatchObject({ voidedById: "admin-1", voidReason: "Entered wrong amount" });
    expect(paymentUpdates[0]).toHaveProperty("voidedAt");
    expect(client.payment).not.toHaveProperty("delete");
    expect(auditLogs[0]).toMatchObject({ action: "PAYMENT_VOIDED", entityType: "Payment" });
  });

  it("rejects voiding an already-voided payment", async () => {
    const { client } = fakeVoidClient({ id: "payment-1", orderId: null, status: "RECEIVED", voidedAt: new Date() });
    await expect(voidPayment(admin, "payment-1", { reason: "again" }, client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("walks a fully-paid order's paymentStatus back to PENDING when its payment is voided", async () => {
    // order.findUnique is re-fetched *after* the payment update inside the same transaction, so
    // its payments reflect the just-applied voidedAt — same as a real Postgres re-read would.
    const order = {
      ...confirmedOrder,
      payments: [{ amount: "5000.00", status: "RECEIVED", voidedAt: new Date() }],
    };
    const { client, orderUpdates } = fakeVoidClient(
      { id: "payment-1", orderId: "order-1", status: "RECEIVED", voidedAt: null },
      order,
    );

    await voidPayment(admin, "payment-1", { reason: "Entered wrong amount" }, client);

    expect(orderUpdates[0]).toMatchObject({ paymentStatus: "PENDING" });
  });
});

describe("listUnifiedPayments", () => {
  it("is SUPER_ADMIN only — STAFF gets a ForbiddenError, never an aggregate total", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);

    await expect(
      listUnifiedPayments(staff, { page: 1, pageSize: 50 }, { findMany, count }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(findMany).not.toHaveBeenCalled();

    await expect(
      listUnifiedPayments(admin, { page: 1, pageSize: 50 }, { findMany, count }),
    ).resolves.toBeDefined();
  });

  it("labels each row by its source (Order vs. POS Sale) and computes totals by method", async () => {
    const rows = [
      {
        id: "payment-1",
        amount: "1000.00",
        method: "CASH",
        receivedAt: new Date(),
        order: { orderNumber: "UOT-10001" },
        localSale: null,
        receivedBy: { name: "Admin" },
      },
      {
        id: "payment-2",
        amount: "500.00",
        method: "CASH",
        receivedAt: new Date(),
        order: null,
        localSale: { saleNumber: "LS-1" },
        receivedBy: { name: "Staff" },
      },
    ];
    const findMany = vi.fn(async () => rows);
    const count = vi.fn(async () => 2);

    const result = await listUnifiedPayments(admin, { page: 1, pageSize: 50 }, { findMany, count });

    expect(result.items[0].source).toBe("Order UOT-10001");
    expect(result.items[1].source).toBe("Sale LS-1");
    expect(result.totalsByMethod.CASH).toBe(1500);
    expect(result.grandTotal).toBe(1500);
  });

  it("never selects/includes the Product relation anywhere (no purchasePrice leak path)", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);

    await listUnifiedPayments(admin, { page: 1, pageSize: 50 }, { findMany, count });

    const call = findMany.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(JSON.stringify(call.include)).not.toContain("product");
    expect(JSON.stringify(call.include)).not.toContain("Product");
  });
});
