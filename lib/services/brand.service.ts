import "server-only";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guard";
import { createBrandSchema, updateBrandSchema } from "@/lib/validation/product.schema";
import type { AuthContext } from "@/types/auth";

type BrandRecord = { id: string; name: string; slug: string };

type BrandClient = {
  brand: {
    create: (args: { data: Record<string, unknown> }) => Promise<BrandRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<BrandRecord>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export async function createBrand(
  ctx: AuthContext,
  input: unknown,
  client: BrandClient = prisma as unknown as BrandClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createBrandSchema.parse(input);

  const brand = await client.brand.create({ data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "BRAND_CREATED",
      entityType: "Brand",
      entityId: brand.id,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return brand;
}

export async function updateBrand(
  ctx: AuthContext,
  brandId: string,
  input: unknown,
  client: BrandClient = prisma as unknown as BrandClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = updateBrandSchema.parse(input);

  const brand = await client.brand.update({ where: { id: brandId }, data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "BRAND_UPDATED",
      entityType: "Brand",
      entityId: brandId,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return brand;
}

export async function listBrands(client: BrandClient = prisma as unknown as BrandClient) {
  // Public read — storefront filters need the active brand list without auth.
  return client.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}
