import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validation/product.schema";
import type { AuthContext } from "@/types/auth";

// Usman Oil Traders sells car engine oil but not car spare parts — this is a fixed
// catalog boundary from the business spec, not a preference, so it is enforced here
// rather than left to seed data and admin process alone.
function isBlockedCategoryName(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes("car") && normalized.includes("spare") && /parts?/.test(normalized);
}

export function assertAllowedCategoryName(name: string): void {
  if (isBlockedCategoryName(name)) {
    throw new ValidationError(
      '"Car Spare Parts" is not a supported category for this catalog.',
    );
  }
}

type CategoryRecord = { id: string; name: string; slug: string };

type CategoryClient = {
  category: {
    create: (args: { data: Record<string, unknown> }) => Promise<CategoryRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<CategoryRecord>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export async function createCategory(
  ctx: AuthContext,
  input: unknown,
  client: CategoryClient = prisma as unknown as CategoryClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createCategorySchema.parse(input);
  assertAllowedCategoryName(data.name);

  const category = await client.category.create({ data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "CATEGORY_CREATED",
      entityType: "Category",
      entityId: category.id,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return category;
}

export async function updateCategory(
  ctx: AuthContext,
  categoryId: string,
  input: unknown,
  client: CategoryClient = prisma as unknown as CategoryClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = updateCategorySchema.parse(input);
  if (data.name) assertAllowedCategoryName(data.name);

  const category = await client.category.update({ where: { id: categoryId }, data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "CATEGORY_UPDATED",
      entityType: "Category",
      entityId: categoryId,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return category;
}

export async function listCategories(
  client: CategoryClient = prisma as unknown as CategoryClient,
) {
  // Public read — no auth required; the storefront needs this for navigation/filters.
  // parentId: null keeps this a genuine top-level tree (each row's own `children` are nested
  // underneath it) rather than a flat list with subcategories duplicated as siblings.
  return client.category.findMany({
    where: { isActive: true, parentId: null },
    include: { children: { where: { isActive: true } } },
    orderBy: { name: "asc" },
  });
}
