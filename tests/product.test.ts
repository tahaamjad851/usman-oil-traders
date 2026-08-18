import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  createProduct,
  discontinueProduct,
  listProducts,
  toPublicProduct,
  updateProduct,
  type TransactionalClient,
} from "@/lib/services/product.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const baseProduct = {
  sku: "ZIC-5W30-1L",
  name: "ZIC X7 5W-30",
  slug: "zic-x7-5w-30",
  categoryId: "clh3k2j9x0000qzrm5x8g7f2a",
  unit: "piece",
  purchasePrice: "2200.00",
  retailPrice: "3000.00",
  stockQuantity: 10,
  minimumStock: 5,
  status: "ACTIVE" as const,
};

function fakeWriteClient(existingSku: { id: string } | null = null) {
  const inventoryTxns: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const findUnique = vi.fn(async () => existingSku);
  const findUniqueOrThrow = vi.fn(async () => ({
    id: "product-1",
    ...baseProduct,
  }));
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: "product-1",
    purchasePrice: args.data.purchasePrice,
    ...args.data,
  }));
  const update = vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: args.where.id,
    ...baseProduct,
    ...args.data,
  }));

  const client: TransactionalClient = {
    product: { findUnique, findUniqueOrThrow, create, update },
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

  return { client, inventoryTxns, auditLogs, updateMock: update };
}

describe("createProduct", () => {
  it("rejects staff", async () => {
    const { client } = fakeWriteClient();
    await expect(createProduct(staff, baseProduct, client)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a duplicate SKU with a clear error", async () => {
    const { client } = fakeWriteClient({ id: "existing" });
    await expect(createProduct(admin, baseProduct, client)).rejects.toThrow(ValidationError);
    await expect(createProduct(admin, baseProduct, client)).rejects.toThrow(/SKU/);
  });

  it("creates the product, logs initial stock, and writes an audit entry", async () => {
    const { client, inventoryTxns, auditLogs } = fakeWriteClient();
    const product = await createProduct(admin, baseProduct, client);

    expect(product).toMatchObject({ sku: baseProduct.sku });
    expect(inventoryTxns).toHaveLength(1);
    expect(inventoryTxns[0]).toMatchObject({ reason: "INITIAL_STOCK", quantityDelta: 10 });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({ action: "PRODUCT_CREATED" });
  });
});

describe("updateProduct", () => {
  it("rejects staff", async () => {
    const { client } = fakeWriteClient();
    await expect(updateProduct(staff, "product-1", { retailPrice: "3200.00" }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("never lets stockQuantity through, even if submitted", async () => {
    const { client, updateMock } = fakeWriteClient();
    await updateProduct(admin, "product-1", { name: "Updated name", stockQuantity: 999 }, client);

    const updateCall = updateMock.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("stockQuantity");
  });

  it("logs PRICE_CHANGED with before/after values when a price field changes", async () => {
    const { client, auditLogs } = fakeWriteClient();
    await updateProduct(admin, "product-1", { retailPrice: "3200.00" }, client);

    expect(auditLogs[0]).toMatchObject({ action: "PRICE_CHANGED" });
    expect(auditLogs[0].previousValue).toMatchObject({ retailPrice: baseProduct.retailPrice });
    expect(auditLogs[0].newValue).toMatchObject({ retailPrice: "3200.00" });
  });

  it("logs PRODUCT_UPDATED when no price field changes", async () => {
    const { client, auditLogs } = fakeWriteClient();
    await updateProduct(admin, "product-1", { name: "New name" }, client);

    expect(auditLogs[0]).toMatchObject({ action: "PRODUCT_UPDATED" });
  });
});

describe("discontinueProduct", () => {
  it("soft-deletes by setting status, never calls a delete method", async () => {
    const update = vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: args.where.id,
      ...baseProduct,
      ...args.data,
    }));
    const client = { product: { update }, auditLog: { create: vi.fn(async () => ({})) } };

    const result = await discontinueProduct(admin, "product-1", client);

    expect(result).toMatchObject({ status: "DISCONTINUED" });
  });

  it("rejects staff", async () => {
    const client = { product: { update: vi.fn() }, auditLog: { create: vi.fn() } };
    await expect(discontinueProduct(staff, "product-1", client)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("public and staff response shaping", () => {
  const fullProduct = {
    id: "product-1",
    ...baseProduct,
    mechanicPrice: "2800.00",
    wholesalePrice: "2600.00",
    supplierId: "supplier-1",
  };

  it("never exposes purchasePrice, mechanicPrice, wholesalePrice, or supplierId to anonymous visitors", () => {
    const shaped = toPublicProduct(fullProduct);
    expect(shaped).not.toHaveProperty("purchasePrice");
    expect(shaped).not.toHaveProperty("mechanicPrice");
    expect(shaped).not.toHaveProperty("wholesalePrice");
    expect(shaped).not.toHaveProperty("supplierId");
    expect(shaped).toHaveProperty("retailPrice", baseProduct.retailPrice);
  });

  it("listProducts only returns ACTIVE products for anonymous visitors regardless of the requested status", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return 0;
    });

    await listProducts(
      null,
      { page: 1, pageSize: 24, status: "DISCONTINUED" },
      { findMany, count },
    );

    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: "ACTIVE" });
  });
});
