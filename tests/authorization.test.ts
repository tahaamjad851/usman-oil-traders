import { describe, expect, it } from "vitest";

import { ForbiddenError, requireRole } from "@/lib/auth/guard";
import {
  getProduct,
  toStaffSafeProduct,
} from "@/lib/services/product.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const product = {
  id: "product-1",
  name: "Engine Oil",
  retailPrice: "3000.00",
  purchasePrice: "2200.00",
};

describe("role authorization", () => {
  it("rejects staff from super-admin operations", () => {
    expect(() => requireRole(staff, "SUPER_ADMIN")).toThrow(ForbiddenError);
  });

  it("allows the owner through a super-admin guard", () => {
    expect(() => requireRole(admin, "SUPER_ADMIN")).not.toThrow();
  });
});

describe("staff-safe product responses", () => {
  it("never serializes purchasePrice for staff", async () => {
    const response = await getProduct(staff, "product-1", {
      findUniqueOrThrow: async () => product,
    });

    expect(response).not.toHaveProperty("purchasePrice");
    expect(JSON.stringify(response)).not.toContain("2200.00");
  });

  it("returns the complete product only to the owner", async () => {
    const response = await getProduct(admin, "product-1", {
      findUniqueOrThrow: async () => product,
    });

    expect(response).toHaveProperty("purchasePrice", "2200.00");
  });

  it("removes purchasePrice even if a caller tries to use the mapper directly", () => {
    expect(toStaffSafeProduct(product)).not.toHaveProperty("purchasePrice");
  });
});
