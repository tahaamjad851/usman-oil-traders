import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  createSupplier,
  listSuppliers,
  listSuppliersWithBalance,
  recordSupplierPayment,
  updateSupplier,
  type TransactionalSupplierPaymentClient,
} from "@/lib/services/supplier.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

function fakeSupplierClient() {
  return {
    supplier: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "supplier-1",
        name: args.data.name as string,
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        name: (args.data.name as string) ?? "Existing Supplier",
      })),
      findMany: vi.fn(async () => []),
    },
    auditLog: { create: vi.fn(async (args: { data: Record<string, unknown> }) => args.data) },
  };
}

describe("supplier authorization", () => {
  it("rejects staff from creating, updating, or listing suppliers", async () => {
    const client = fakeSupplierClient();
    await expect(createSupplier(staff, { name: "ZIC Distributors" }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateSupplier(staff, "supplier-1", { name: "New name" }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listSuppliers(staff, client)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows the owner to create a supplier and writes an audit entry", async () => {
    const client = fakeSupplierClient();
    const supplier = await createSupplier(admin, { name: "ZIC Distributors" }, client);

    expect(supplier).toMatchObject({ name: "ZIC Distributors" });
    expect(client.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

function fakeSupplierPaymentClient(
  purchase?: { id: string; supplierId: string; totalAmount: unknown },
  priorPayments: Array<{ amount: unknown }> = [],
) {
  const paymentsCreated: Record<string, unknown>[] = [];
  const purchaseUpdates: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const client: TransactionalSupplierPaymentClient = {
    supplier: { findUniqueOrThrow: vi.fn(async () => ({ id: "supplier-1" })) },
    purchase: {
      findUniqueOrThrow: vi.fn(async () => {
        if (!purchase) throw new Error("no purchase configured for this test");
        return purchase;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        purchaseUpdates.push(args.data);
        return { id: args.where.id, ...args.data };
      }),
    },
    supplierPayment: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const record = { id: "sp-1", ...args.data };
        paymentsCreated.push(args.data);
        return record;
      }),
      findMany: vi.fn(async () => priorPayments),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        auditLogs.push(args.data);
        return args.data;
      }),
    },
    $transaction: async (fn) => fn(client),
  };

  return { client, paymentsCreated, purchaseUpdates, auditLogs };
}

describe("recordSupplierPayment", () => {
  it("is SUPER_ADMIN only", async () => {
    const { client } = fakeSupplierPaymentClient();
    await expect(
      recordSupplierPayment(staff, "supplier-1", { amount: "100.00", method: "CASH" }, client),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("records a general payment (no purchaseId) without touching any purchase", async () => {
    const { client, paymentsCreated, purchaseUpdates } = fakeSupplierPaymentClient();

    await recordSupplierPayment(admin, "supplier-1", { amount: "500.00", method: "CASH" }, client);

    expect(paymentsCreated[0]).toMatchObject({ supplierId: "supplier-1", purchaseId: null, amount: "500.00" });
    expect(purchaseUpdates).toHaveLength(0);
  });

  it("rejects a purchase-linked payment for a purchase belonging to a different supplier", async () => {
    const { client } = fakeSupplierPaymentClient({
      id: "cl000000000000000000003",
      supplierId: "some-other-supplier",
      totalAmount: "1000.00",
    });
    await expect(
      recordSupplierPayment(admin, "supplier-1", { purchaseId: "cl000000000000000000003", amount: "100.00", method: "CASH" }, client),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a payment that would overpay the purchase", async () => {
    const { client } = fakeSupplierPaymentClient({ id: "cl000000000000000000003", supplierId: "supplier-1", totalAmount: "1000.00" });
    await expect(
      recordSupplierPayment(admin, "supplier-1", { purchaseId: "cl000000000000000000003", amount: "1500.00", method: "CASH" }, client),
    ).rejects.toThrow(/exceeds the purchase's remaining balance/i);
  });

  it("keeps paymentStatus UNPAID for a zero-amount payment", async () => {
    const { client, purchaseUpdates } = fakeSupplierPaymentClient(
      { id: "cl000000000000000000003", supplierId: "supplier-1", totalAmount: "1000.00" },
      [],
    );
    await recordSupplierPayment(admin, "supplier-1", { purchaseId: "cl000000000000000000003", amount: "0.00", method: "CASH" }, client);
    expect(purchaseUpdates[0]).toMatchObject({ paymentStatus: "UNPAID" });
  });

  it("recomputes paymentStatus to PARTIALLY_PAID when some but not all of the purchase is paid", async () => {
    const { client, purchaseUpdates } = fakeSupplierPaymentClient(
      { id: "cl000000000000000000003", supplierId: "supplier-1", totalAmount: "1000.00" },
      [],
    );
    await recordSupplierPayment(admin, "supplier-1", { purchaseId: "cl000000000000000000003", amount: "400.00", method: "CASH" }, client);
    expect(purchaseUpdates[0]).toMatchObject({ paymentStatus: "PARTIALLY_PAID" });
  });

  it("recomputes paymentStatus to PAID once payments fully cover the purchase (epsilon-safe)", async () => {
    const { client, purchaseUpdates } = fakeSupplierPaymentClient(
      { id: "cl000000000000000000003", supplierId: "supplier-1", totalAmount: "1000.00" },
      [{ amount: "600.00" }],
    );
    await recordSupplierPayment(admin, "supplier-1", { purchaseId: "cl000000000000000000003", amount: "400.00", method: "CASH" }, client);
    expect(purchaseUpdates[0]).toMatchObject({ paymentStatus: "PAID" });
  });

  it("writes a SUPPLIER_PAYMENT_RECORDED audit entry", async () => {
    const { client, auditLogs } = fakeSupplierPaymentClient();
    await recordSupplierPayment(admin, "supplier-1", { amount: "100.00", method: "CASH" }, client);
    expect(auditLogs[0]).toMatchObject({ action: "SUPPLIER_PAYMENT_RECORDED", entityType: "Supplier" });
  });
});

describe("listSuppliersWithBalance", () => {
  it("is SUPER_ADMIN only", async () => {
    const client = {
      supplier: { findMany: vi.fn(async () => []), findUniqueOrThrow: vi.fn() },
      purchase: { findMany: vi.fn(async () => []) },
      supplierPayment: { findMany: vi.fn(async () => []) },
    };
    await expect(listSuppliersWithBalance(staff, client)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("computes balance as total purchased minus total paid", async () => {
    const client = {
      supplier: {
        findMany: vi.fn(async () => [
          {
            id: "supplier-1",
            name: "ZIC Distributors",
            company: null,
            phone: null,
            address: null,
            notes: null,
            isActive: true,
            createdAt: new Date(),
          },
        ]),
        findUniqueOrThrow: vi.fn(),
      },
      purchase: { findMany: vi.fn(async () => [{ supplierId: "supplier-1", totalAmount: "5000.00" }]) },
      supplierPayment: { findMany: vi.fn(async () => [{ supplierId: "supplier-1", amount: "2000.00" }]) },
    };

    const result = await listSuppliersWithBalance(admin, client);
    expect(result[0]).toMatchObject({ totalPurchased: 5000, totalPaid: 2000, balance: 3000 });
  });
});
