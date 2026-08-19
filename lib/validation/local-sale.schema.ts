import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";

export const localSaleItemInputSchema = z.object({
  productId: z.cuid(),
  quantity: z.number().int().positive(),
});

export const paymentMethods = ["CASH", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER", "OTHER"] as const;

export const createLocalSaleSchema = z.object({
  // Both optional — many walk-in POS sales are anonymous. A phone (if given) finds-or-creates a
  // Customer record (same pattern as Phase 7's guest checkout); a name with no phone has nowhere
  // durable to live in the current schema, so it's accepted but not persisted — see the report.
  customerName: z.string().trim().min(1).max(100).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, "Enter a valid Pakistani mobile number.")
    .optional(),
  items: z.array(localSaleItemInputSchema).min(1, "Sale must include at least one item"),
  paymentMethod: z.enum(paymentMethods).default("CASH"),
  amountTendered: decimalString.optional(),
  transactionReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  // Mirrors adjustStock (Phase 5) and confirmOrder (Phase 7): the atomic stock decrement is
  // blocked from going negative unless this is explicitly set.
  allowNegativeStock: z.boolean().default(false),
});

export const localSaleQuerySchema = z.object({
  soldById: z.cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type CreateLocalSaleInput = z.infer<typeof createLocalSaleSchema>;
export type LocalSaleQuery = z.infer<typeof localSaleQuerySchema>;
