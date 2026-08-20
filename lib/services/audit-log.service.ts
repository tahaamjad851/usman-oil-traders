import "server-only";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guard";
import type { AuthContext } from "@/types/auth";
import type { AuditLogQuery } from "@/lib/validation/audit-log.schema";

type AuditLogLister = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

const defaultLister: AuditLogLister = prisma.auditLog as unknown as AuditLogLister;

export async function listAuditLogs(
  ctx: AuthContext,
  filters: AuditLogQuery,
  lister: AuditLogLister = defaultLister,
) {
  // Audit log entries are a security record of what everyone else did — reading them is
  // restricted to SUPER_ADMIN only, stricter than most reporting endpoints.
  requireRole(ctx, "SUPER_ADMIN");

  const where: Record<string, unknown> = {};
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;

  const [items, total] = await Promise.all([
    lister.findMany({
      where,
      include: { user: { select: { name: true, username: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    lister.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}
