import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";
import { paymentMethods } from "@/lib/validation/payment.schema";

export const recordCustomerPaymentSchema = z.object({
  amount: decimalString,
  method: z.enum(paymentMethods),
  transactionReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type RecordCustomerPaymentInput = z.infer<typeof recordCustomerPaymentSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
