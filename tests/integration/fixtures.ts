import { prisma } from "@/lib/db";
import type { AuthContext } from "@/types/auth";

let userCounter = 0;
let productCounter = 0;
let categoryCounter = 0;

export async function createTestUser(role: "SUPER_ADMIN" | "STAFF"): Promise<AuthContext> {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      name: `Test ${role} ${userCounter}`,
      username: `test-${role.toLowerCase()}-${userCounter}-${Date.now()}`,
      // Never exercised through the real login flow in these tests — any non-empty string
      // satisfies the NOT NULL column without needing a real argon2 hash.
      passwordHash: "unused-in-integration-tests",
      role,
    },
  });

  return {
    userId: user.id,
    role,
    username: user.username,
    mustChangePassword: false,
  };
}

export async function createTestCategory(): Promise<string> {
  categoryCounter += 1;
  const category = await prisma.category.create({
    data: { name: `Test Category ${categoryCounter}`, slug: `test-category-${categoryCounter}-${Date.now()}` },
  });
  return category.id;
}

export async function createTestProduct(options: { stockQuantity: number; categoryId?: string }): Promise<{
  id: string;
  name: string;
}> {
  productCounter += 1;
  const categoryId = options.categoryId ?? (await createTestCategory());
  const product = await prisma.product.create({
    data: {
      sku: `TEST-SKU-${productCounter}-${Date.now()}`,
      name: `Test Product ${productCounter}`,
      slug: `test-product-${productCounter}-${Date.now()}`,
      categoryId,
      purchasePrice: "500.00",
      retailPrice: "800.00",
      stockQuantity: options.stockQuantity,
    },
  });
  return { id: product.id, name: product.name };
}
