import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  assertAllowedCategoryName,
  createCategory,
  listCategories,
  updateCategory,
} from "@/lib/services/category.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

function fakeCategoryClient() {
  return {
    category: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "cat-1",
        name: args.data.name as string,
        slug: args.data.slug as string,
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        name: (args.data.name as string) ?? "Engine Oils",
        slug: (args.data.slug as string) ?? "engine-oils",
      })),
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        void args;
        return [] as never[];
      }),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => args.data),
    },
  };
}

describe("Car Spare Parts is not a supported category", () => {
  it.each([
    "Car Spare Parts",
    "car spare parts",
    "Car Spare Part",
    "CAR   SPARE   PARTS",
  ])("blocks the name %j from being created", (name) => {
    expect(() => assertAllowedCategoryName(name)).toThrow(ValidationError);
  });

  it("does not block unrelated names, including other car- or parts-related ones", () => {
    expect(() => assertAllowedCategoryName("Motorcycle Parts")).not.toThrow();
    expect(() => assertAllowedCategoryName("Tractor Parts")).not.toThrow();
    expect(() => assertAllowedCategoryName("Car Engine Oil")).not.toThrow();
  });

  it("rejects a create attempt for the blocked name even from the owner", async () => {
    const client = fakeCategoryClient();
    await expect(
      createCategory(admin, { name: "Car Spare Parts", slug: "car-spare-parts" }, client),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(client.category.create).not.toHaveBeenCalled();
  });

  it("rejects a rename into the blocked name", async () => {
    const client = fakeCategoryClient();
    await expect(
      updateCategory(admin, "cat-1", { name: "Car Spare Parts" }, client),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(client.category.update).not.toHaveBeenCalled();
  });
});

describe("category authorization", () => {
  it("rejects staff from creating categories", async () => {
    const client = fakeCategoryClient();
    await expect(
      createCategory(staff, { name: "Engine Oils", slug: "engine-oils" }, client),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows the owner to create an allowed category", async () => {
    const client = fakeCategoryClient();
    const category = await createCategory(admin, { name: "Engine Oils", slug: "engine-oils" }, client);
    expect(category).toMatchObject({ name: "Engine Oils", slug: "engine-oils" });
  });
});

describe("listCategories", () => {
  it("only queries top-level categories, so children come back nested rather than duplicated as siblings", async () => {
    const client = fakeCategoryClient();
    await listCategories(client);

    expect(client.category.findMany.mock.calls[0][0]).toMatchObject({
      where: { isActive: true, parentId: null },
    });
  });
});
