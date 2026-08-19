import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import {
  assertValidExpenseAttachment,
  createExpense,
  getExpense,
  listExpenses,
  softDeleteExpense,
  updateExpense,
} from "@/lib/services/expense.service";
import type { AuthContext } from "@/types/auth";

const staff: AuthContext = {
  userId: "staff-1",
  username: "staff",
  role: "STAFF",
  mustChangePassword: false,
};

const admin: AuthContext = { ...staff, userId: "admin-1", role: "SUPER_ADMIN" };

const validExpense = {
  category: "RENT" as const,
  amount: "50000.00",
  date: "2026-08-01",
};

function fakeExpenseClient(existing: Record<string, unknown> & { id: string; deletedAt: unknown } = {
  id: "expense-1",
  deletedAt: null,
}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const client = {
    expense: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: "expense-1", deletedAt: null, ...args.data };
      }),
      findUniqueOrThrow: vi.fn(async () => existing),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updated.push(args.data);
        return { ...existing, ...args.data };
      }),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        auditLogs.push(args.data);
        return args.data;
      }),
    },
  };

  return { client, created, updated, auditLogs };
}

describe("expense role restriction — SUPER_ADMIN only for both reads and writes", () => {
  it("rejects STAFF from creating, updating, deleting, listing, and viewing expenses", async () => {
    const { client } = fakeExpenseClient();
    await expect(createExpense(staff, validExpense, client)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateExpense(staff, "expense-1", { amount: "100.00" }, client)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(softDeleteExpense(staff, "expense-1", client)).rejects.toBeInstanceOf(ForbiddenError);

    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const groupBy = vi.fn(async () => []);
    await expect(
      listExpenses(staff, { page: 1, pageSize: 30 }, { findMany, count, groupBy }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const findUniqueOrThrow = vi.fn(async () => ({ id: "expense-1" }));
    await expect(getExpense(staff, "expense-1", { findUniqueOrThrow })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows SUPER_ADMIN to create an expense and writes an audit entry", async () => {
    const { client, created, auditLogs } = fakeExpenseClient();
    const expense = await createExpense(admin, validExpense, client);

    expect(expense).toMatchObject({ category: "RENT" });
    expect(created[0]).toMatchObject({ createdById: "admin-1" });
    expect(auditLogs[0]).toMatchObject({ action: "EXPENSE_RECORDED" });
  });
});

describe("expense soft-delete", () => {
  it("updates deletedAt/deletedById rather than deleting the row", async () => {
    const { client, updated, auditLogs } = fakeExpenseClient();
    await softDeleteExpense(admin, "expense-1", client);

    expect(updated[0]).toMatchObject({ deletedById: "admin-1" });
    expect(updated[0]).toHaveProperty("deletedAt");
    expect(client.expense).not.toHaveProperty("delete");
    expect(auditLogs[0]).toMatchObject({ action: "EXPENSE_DELETED" });
  });

  it("rejects deleting an already-deleted expense", async () => {
    const { client } = fakeExpenseClient({ id: "expense-1", deletedAt: new Date() });
    await expect(softDeleteExpense(admin, "expense-1", client)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects editing a deleted expense", async () => {
    const { client } = fakeExpenseClient({ id: "expense-1", deletedAt: new Date() });
    await expect(updateExpense(admin, "expense-1", { amount: "1.00" }, client)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("listExpenses excludes deleted expenses by default (deletedAt: null in the where clause)", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);
    const groupBy = vi.fn(async () => []);

    await listExpenses(admin, { page: 1, pageSize: 30 }, { findMany, count, groupBy });

    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { deletedAt: null } });
  });
});

describe("category and date-range filtering", () => {
  it("filters by category and date range in the where clause", async () => {
    const findMany = vi.fn(async (args: Record<string, unknown>) => {
      void args;
      return [] as never[];
    });
    const count = vi.fn(async () => 0);
    const groupBy = vi.fn(async () => []);

    const from = new Date("2026-08-01");
    const to = new Date("2026-08-31");
    await listExpenses(admin, { category: "SALARY", from, to, page: 1, pageSize: 30 }, { findMany, count, groupBy });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { deletedAt: null, category: "SALARY", date: { gte: from, lte: to } },
    });
  });

  it("returns per-category totals via groupBy", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const groupBy = vi.fn(async () => [
      { category: "RENT", _sum: { amount: "50000.00" } },
      { category: "SALARY", _sum: { amount: "30000.00" } },
    ]);

    const result = await listExpenses(admin, { page: 1, pageSize: 30 }, { findMany, count, groupBy });

    expect(result.categoryTotals).toEqual([
      { category: "RENT", total: 50000 },
      { category: "SALARY", total: 30000 },
    ]);
  });
});

describe("assertValidExpenseAttachment", () => {
  it("accepts jpeg, png, webp, and pdf under 10MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(() => assertValidExpenseAttachment({ type, size: 1024 })).not.toThrow();
    }
  });

  it("rejects unsupported types", () => {
    expect(() => assertValidExpenseAttachment({ type: "application/zip", size: 1024 })).toThrow(ValidationError);
  });

  it("rejects files over 10MB", () => {
    expect(() =>
      assertValidExpenseAttachment({ type: "application/pdf", size: 10 * 1024 * 1024 + 1 }),
    ).toThrow(ValidationError);
  });
});
