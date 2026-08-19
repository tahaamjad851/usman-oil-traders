import { z } from "zod";

const supplierBaseSchema = z.object({
  name: z.string().trim().min(2).max(150),
  company: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const createSupplierSchema = supplierBaseSchema;
export const updateSupplierSchema = supplierBaseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
