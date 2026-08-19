import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";

// Reuses the ExpenseCategory enum already defined in Phase 2's schema (RENT, ELECTRICITY, SALARY,
// TRANSPORTATION, DELIVERY, MAINTENANCE, MISCELLANEOUS, OTHER) rather than introducing a second,
// slightly-different category list.
export const expenseCategories = [
  "RENT",
  "ELECTRICITY",
  "SALARY",
  "TRANSPORTATION",
  "DELIVERY",
  "MAINTENANCE",
  "MISCELLANEOUS",
  "OTHER",
] as const;

const expenseBaseSchema = z.object({
  category: z.enum(expenseCategories),
  amount: decimalString,
  date: z.coerce.date(),
  description: z.string().trim().max(500).optional(),
});

export const createExpenseSchema = expenseBaseSchema;
export const updateExpenseSchema = expenseBaseSchema.partial();

export const expenseQuerySchema = z.object({
  category: z.enum(expenseCategories).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});

export const attachmentUploadMetaSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, "Attachment exceeds 10MB limit."),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;
