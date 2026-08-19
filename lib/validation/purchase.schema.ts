import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";

export const purchaseItemInputSchema = z.object({
  productId: z.cuid(),
  quantity: z.number().int().positive(),
  unitCost: decimalString,
});

export const createPurchaseSchema = z.object({
  supplierId: z.cuid(),
  invoiceNumber: z.string().trim().max(100).optional(),
  purchaseDate: z.coerce.date(),
  paymentStatus: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).default("UNPAID"),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(purchaseItemInputSchema)
    .min(1, "Purchase must include at least one item"),
});

export const purchaseQuerySchema = z.object({
  supplierId: z.cuid().optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type PurchaseQuery = z.infer<typeof purchaseQuerySchema>;
