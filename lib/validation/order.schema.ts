import { z } from "zod";

import { decimalString } from "@/lib/validation/product.schema";

export const orderStatuses = [
  "NEW",
  "WHATSAPP_CONTACTED",
  "PRICE_CONFIRMED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export const createOrderItemSchema = z.object({
  productId: z.cuid(),
  quantity: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  // Required — this is how staff reach the customer to confirm price/delivery over WhatsApp.
  customerPhone: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, "Enter a valid Pakistani mobile number."),
  // Optional — customers may also pick up in person rather than have it delivered.
  customerAddress: z.string().trim().max(500).optional(),
  customerNotes: z.string().trim().max(500).optional(),
  items: z.array(createOrderItemSchema).min(1, "Cart cannot be empty."),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatuses),
  finalProductAmount: decimalString.optional(),
  deliveryCharge: decimalString.optional(),
  discount: decimalString.optional(),
  // Mirrors adjustStock's override flag (Phase 5): confirming an order decrements stock
  // atomically, and this is required to let that decrement go negative instead of being blocked.
  allowNegativeStock: z.boolean().default(false),
});

export const orderQuerySchema = z.object({
  status: z.enum(orderStatuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
