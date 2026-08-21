import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/auth/guard";
import { listAuditLogs } from "@/lib/services/audit-log.service";
import type { AuthContext } from "@/types/auth";

const admin: AuthContext = { userId: "admin-1", username: "admin", role: "SUPER_ADMIN", mustChangePassword: false };
const staff: AuthContext = { userId: "staff-1", username: "staff", role: "STAFF", mustChangePassword: false };

function fakeLister(rows: Record<string, unknown>[] = []) {
  return {
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      capturedArgs.push(args);
      return rows;
    }),
    count: vi.fn(async () => rows.length),
  };
}

let capturedArgs: Record<string, unknown>[] = [];

describe("listAuditLogs", () => {
  it("rejects STAFF before any query executes", async () => {
    const lister = fakeLister();
    await expect(listAuditLogs(staff, { page: 1, pageSize: 50 }, lister)).rejects.toBeInstanceOf(ForbiddenError);
    expect(lister.findMany).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN can list entries, filtered by action and entityType", async () => {
    capturedArgs = [];
    const rows = [{ id: "log-1", action: "PAYMENT_VOIDED", entityType: "Payment" }];
    const lister = fakeLister(rows);

    const result = await listAuditLogs(admin, { action: "PAYMENT_VOIDED", entityType: "Payment", page: 1, pageSize: 50 }, lister);

    expect(result).toMatchObject({ items: rows, total: 1, page: 1, pageSize: 50 });
    expect(capturedArgs[0].where).toMatchObject({ action: "PAYMENT_VOIDED", entityType: "Payment" });
  });

  it("paginates via skip/take derived from page and pageSize", async () => {
    capturedArgs = [];
    const lister = fakeLister([]);
    await listAuditLogs(admin, { page: 3, pageSize: 20 }, lister);
    expect(capturedArgs[0]).toMatchObject({ skip: 40, take: 20 });
  });
});
