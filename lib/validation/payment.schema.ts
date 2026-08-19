import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";

export const paymentMethods = ["CASH", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER", "OTHER"] as const;

export const recordOrderPaymentSchema = z.object({
  amount: decimalString,
  method: z.enum(paymentMethods),
  transactionReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required to void a payment.").max(500),
});

export const paymentQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  method: z.enum(paymentMethods).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type RecordOrderPaymentInput = z.infer<typeof recordOrderPaymentSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
