import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/auth/guard";
import { createSupplier, listSuppliers, updateSupplier } from "@/lib/services/supplier.service";
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
