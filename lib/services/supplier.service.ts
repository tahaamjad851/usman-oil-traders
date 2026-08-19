import "server-only";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guard";
import { createSupplierSchema, updateSupplierSchema } from "@/lib/validation/supplier.schema";
import type { AuthContext } from "@/types/auth";

type SupplierRecord = { id: string; name: string };

type SupplierClient = {
  supplier: {
    create: (args: { data: Record<string, unknown> }) => Promise<SupplierRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<SupplierRecord>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

// Suppliers are only ever selected when recording a purchase, and purchases are SUPER_ADMIN-only
// (per the Phase 1 role matrix), so supplier records — including their contact details — are not
// exposed to staff at all.
export async function createSupplier(
  ctx: AuthContext,
  input: unknown,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createSupplierSchema.parse(input);

  const supplier = await client.supplier.create({ data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return supplier;
}

export async function updateSupplier(
  ctx: AuthContext,
  supplierId: string,
  input: unknown,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = updateSupplierSchema.parse(input);

  const supplier = await client.supplier.update({ where: { id: supplierId }, data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "SUPPLIER_UPDATED",
      entityType: "Supplier",
      entityId: supplierId,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return supplier;
}

export async function listSuppliers(
  ctx: AuthContext,
  client: SupplierClient = prisma as unknown as SupplierClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  return client.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}
