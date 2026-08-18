import { z } from "zod";

const decimalString = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Must be a non-negative number with up to 2 decimal places.");

const productBaseSchema = z.object({
  sku: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens."),
  description: z.string().max(2000).optional(),
  brandId: z.cuid().optional(),
  categoryId: z.cuid(),
  subcategoryId: z.cuid().optional(),
  viscosity: z.string().max(20).optional(),
  size: z.string().max(20).optional(),
  unit: z.string().max(20).default("piece"),
  fuelType: z.string().max(20).optional(),
  oilType: z.string().max(30).optional(),
  compatibility: z.string().max(500).optional(),
  purchasePrice: decimalString,
  retailPrice: decimalString,
  mechanicPrice: decimalString.optional(),
  wholesalePrice: decimalString.optional(),
  stockQuantity: z.number().int().nonnegative().default(0),
  minimumStock: z.number().int().nonnegative().default(5),
  supplierId: z.cuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
});

function retailNotSuspiciouslyLowerThanPurchase(d: {
  purchasePrice?: string;
  retailPrice?: string;
}) {
  if (d.purchasePrice === undefined || d.retailPrice === undefined) return true;
  return Number(d.retailPrice) >= Number(d.purchasePrice) * 0.5;
}

// Sanity guard, not a hard business rule (margins vary by product) — catches the most common
// real-world data-entry mistake (a misplaced decimal or swapped field). The admin can still
// resubmit with an explicit value; nothing here blocks a genuinely low margin.
const RETAIL_TOO_LOW_ISSUE = {
  message: "Retail price looks too low relative to purchase price — please confirm.",
  path: ["retailPrice"],
};

export const createProductSchema = productBaseSchema.refine(
  retailNotSuspiciouslyLowerThanPurchase,
  RETAIL_TOO_LOW_ISSUE,
);

export const updateProductSchema = productBaseSchema.partial().refine(
  retailNotSuspiciouslyLowerThanPurchase,
  RETAIL_TOO_LOW_ISSUE,
);

export const productSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.cuid().optional(),
  brandId: z.cuid().optional(),
  viscosity: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

const categoryBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens."),
  parentId: z.cuid().optional(),
});

export const createCategorySchema = categoryBaseSchema;
export const updateCategorySchema = categoryBaseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const brandBaseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens."),
  logoUrl: z.url().optional(),
});

export const createBrandSchema = brandBaseSchema;
export const updateBrandSchema = brandBaseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const imageUploadMetaSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024, "Image exceeds 5MB limit."),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
