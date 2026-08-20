import { z } from "zod";

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
