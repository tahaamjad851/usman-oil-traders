import "server-only";

import { prisma } from "@/lib/db";

type AuditLogData = {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
};

type AuditLogWriter = {
  auditLog: {
    create: (args: { data: AuditLogData }) => Promise<unknown>;
  };
};

export function writeAuditLog(data: AuditLogData, client: AuditLogWriter = prisma) {
  return client.auditLog.create({ data });
}
