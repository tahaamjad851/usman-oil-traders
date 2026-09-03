import { z } from "zod";

// PURCHASE, LOCAL_SALE, WEBSITE_ORDER, ORDER_CANCELLATION are always written by the flow that
// caused them (purchase receiving, POS sale, website fulfillment) — never by a direct API call —
// so the manual-adjustment endpoint only accepts the movement types a person can deliberately log.
//
// TRANSFER was scaffolded for a multi-branch feature that was never built (no source/destination
// location exists anywhere in this codebase) and is deliberately excluded here so no new
// adjustment can be logged with it — it stays in the Prisma enum and in
// inventoryTransactionQuerySchema's filter below purely because historical rows may still carry
// it; removing a value from a live Postgres enum requires rewriting every referencing row, which
// isn't worth doing for this.
export const manualAdjustmentTypes = ["MANUAL_ADJUSTMENT", "DAMAGE", "RETURN"] as const;

export const adjustStockSchema = z.object({
  type: z.enum(manualAdjustmentTypes).default("MANUAL_ADJUSTMENT"),
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, "quantityDelta must not be zero"),
  reason: z.string().trim().min(3, "A reason is required for every stock adjustment.").max(500),
  // Stock is not allowed to go negative unless this is explicitly set — see adjustStock().
  allowNegative: z.boolean().default(false),
});

export const inventoryTransactionQuerySchema = z.object({
  productId: z.cuid().optional(),
  type: z
    .enum([
      "PURCHASE",
      "LOCAL_SALE",
      "WEBSITE_ORDER",
      "ORDER_CANCELLATION",
      "RETURN",
      "MANUAL_ADJUSTMENT",
      "DAMAGE",
      "TRANSFER",
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const lowStockQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type InventoryTransactionQuery = z.infer<typeof inventoryTransactionQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
