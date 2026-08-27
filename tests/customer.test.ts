import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  listCustomersWithBalance,
  recordCustomerPayment,
  type TransactionalCustomerPaymentClient,
} from "@/lib/services/customer.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

describe("listCustomersWithBalance", () => {
  it("is SUPER_ADMIN only", async () => {
    const client = {
      customer: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), findUniqueOrThrow: vi.fn() },
      order: { findMany: vi.fn(async () => []) },
      localSale: { findMany: vi.fn(async () => []) },
      payment: { findMany: vi.fn(async () => []) },
    };
    await expect(listCustomersWithBalance(staff, { page: 1, pageSize: 50 }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("computes balance as (orders + local sales, excluding cancelled) minus received payments", async () => {
    const client = {
      customer: {
        findMany: vi.fn(async () => [
          { id: "cust-1", name: "Ali", phone: "0300", whatsapp: null, city: null, isActive: true, createdAt: new Date() },
        ]),
        count: vi.fn(async () => 1),
        findUniqueOrThrow: vi.fn(),
      },
      order: {
        findMany: vi.fn(async () => [
          // finalConfirmedAmount wins over websiteSubtotal once the order is priced.
          { customerId: "cust-1", status: "DELIVERED", websiteSubtotal: "1000.00", finalConfirmedAmount: "1200.00" },
          // Cancelled orders never contribute, even though this one has a large subtotal.
          { customerId: "cust-1", status: "CANCELLED", websiteSubtotal: "5000.00", finalConfirmedAmount: null },
        ]),
      },
      localSale: {
        findMany: vi.fn(async () => [{ customerId: "cust-1", totalAmount: "300.00" }]),
      },
      payment: {
        findMany: vi.fn(async () => [{ customerId: "cust-1", amount: "500.00", status: "RECEIVED", voidedAt: null }]),
      },
    };

    const result = await listCustomersWithBalance(admin, { page: 1, pageSize: 50 }, client);

    expect(result.items[0]).toMatchObject({ totalOwed: 1500, totalPaid: 500, balance: 1000 });
  });
});

describe("recordCustomerPayment", () => {
  function fakeClient(overrides: {
    orders?: Array<{ status: string; websiteSubtotal: unknown; finalConfirmedAmount: unknown }>;
    localSales?: Array<{ totalAmount: unknown }>;
    payments?: Array<{ amount: unknown; status: string; voidedAt: unknown }>;
  }) {
    const paymentsCreated: Record<string, unknown>[] = [];
    const auditLogs: Record<string, unknown>[] = [];

    const client: TransactionalCustomerPaymentClient = {
      customer: { findUniqueOrThrow: vi.fn(async () => ({ id: "cust-1" })) },
      order: { findMany: vi.fn(async () => overrides.orders ?? []) },
      localSale: { findMany: vi.fn(async () => overrides.localSales ?? []) },
      payment: {
        findMany: vi.fn(async () => overrides.payments ?? []),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const record = { id: "payment-1", ...args.data };
          paymentsCreated.push(args.data);
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

    return { client, paymentsCreated, auditLogs };
  }

  const oneOrder = [{ status: "DELIVERED", websiteSubtotal: "1000.00", finalConfirmedAmount: null }];

  it("is SUPER_ADMIN only", async () => {
    const { client } = fakeClient({ orders: oneOrder });
    await expect(
      recordCustomerPayment(staff, "cust-1", { amount: "100.00", method: "CASH" }, client),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates a customer-linked Payment with no orderId/localSaleId", async () => {
    const { client, paymentsCreated } = fakeClient({ orders: oneOrder });

    await recordCustomerPayment(admin, "cust-1", { amount: "500.00", method: "CASH" }, client);

    expect(paymentsCreated[0]).toMatchObject({ customerId: "cust-1", amount: "500.00", status: "RECEIVED" });
    expect(paymentsCreated[0]).not.toHaveProperty("orderId");
    expect(paymentsCreated[0]).not.toHaveProperty("localSaleId");
  });

  it("rejects a payment that exceeds the customer's outstanding balance", async () => {
    const { client } = fakeClient({ orders: oneOrder });
    await expect(
      recordCustomerPayment(admin, "cust-1", { amount: "1500.00", method: "CASH" }, client),
    ).rejects.toThrow(/exceeds the customer's outstanding balance/i);
  });

  it("allows a payment that exactly settles the balance (epsilon-safe)", async () => {
    const { client } = fakeClient({ orders: oneOrder });
    await expect(
      recordCustomerPayment(admin, "cust-1", { amount: "1000.00", method: "CASH" }, client),
    ).resolves.toBeDefined();
  });

  it("rejects any payment once the balance is already fully paid off", async () => {
    const { client } = fakeClient({
      orders: oneOrder,
      payments: [{ amount: "1000.00", status: "RECEIVED", voidedAt: null }],
    });
    await expect(
      recordCustomerPayment(admin, "cust-1", { amount: "1.00", method: "CASH" }, client),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("writes a KHATA_PAYMENT_RECORDED audit entry", async () => {
    const { client, auditLogs } = fakeClient({ orders: oneOrder });
    await recordCustomerPayment(admin, "cust-1", { amount: "200.00", method: "CASH" }, client);
    expect(auditLogs[0]).toMatchObject({ action: "KHATA_PAYMENT_RECORDED", entityType: "Customer" });
  });
});
