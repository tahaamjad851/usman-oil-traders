import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";
import { paymentMethods } from "@/lib/validation/payment.schema";

// supplierId is not part of this schema — it comes from the URL (/api/suppliers/[id]/payments),
// same as recordOrderPayment takes orderId as a function argument rather than a body field.
export const recordSupplierPaymentSchema = z.object({
  purchaseId: z.cuid().optional(),
  amount: decimalString,
  method: z.enum(paymentMethods),
  notes: z.string().trim().max(500).optional(),
});

export type RecordSupplierPaymentInput = z.infer<typeof recordSupplierPaymentSchema>;
