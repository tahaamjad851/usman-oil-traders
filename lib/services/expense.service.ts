import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { uploadToStorage } from "@/lib/storage";
import {
  createExpenseSchema,
  updateExpenseSchema,
  type ExpenseQuery,
} from "@/lib/validation/expense.schema";
import type { AuthContext } from "@/types/auth";

// Judgment call, stated explicitly: expense recording and viewing are SUPER_ADMIN-only, for both
// reads and writes. Unlike Payment (Phase 10), which STAFF must be able to record because they're
// standing at the counter with the customer, an expense (rent, salary, utilities) has no
// operational counterpart that requires staff involvement — it is pure financial data, and the
// business rules already establish that profit/financial visibility is owner-only. Every function
// below calls requireRole(ctx, "SUPER_ADMIN"), not requireAnyRole.

type ExpenseRecord = Record<string, unknown> & { id: string; deletedAt: unknown };

type ExpenseWriteClient = {
  expense: {
    create: (args: { data: Record<string, unknown> }) => Promise<ExpenseRecord>;
    findUniqueOrThrow: (args: { where: { id: string }; include?: unknown }) => Promise<ExpenseRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ExpenseRecord>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export async function createExpense(
  ctx: AuthContext,
  input: unknown,
  client: ExpenseWriteClient = prisma as unknown as ExpenseWriteClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createExpenseSchema.parse(input);

  const expense = await client.expense.create({ data: { ...data, createdById: ctx.userId } });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "EXPENSE_RECORDED",
      entityType: "Expense",
      entityId: expense.id,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return expense;
}

export async function updateExpense(
  ctx: AuthContext,
  expenseId: string,
  input: unknown,
  client: ExpenseWriteClient = prisma as unknown as ExpenseWriteClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = updateExpenseSchema.parse(input);

  const before = await client.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (before.deletedAt) {
    throw new ValidationError("Cannot edit a deleted expense.");
  }

  const updated = await client.expense.update({ where: { id: expenseId }, data });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "EXPENSE_UPDATED",
      entityType: "Expense",
      entityId: expenseId,
      previousValue: before,
      newValue: data,
      ipAddress: ctx.ip,
    },
  });

  return updated;
}

// Soft delete only — never a hard prisma.expense.delete(). The original record (amount,
// category, who recorded it) is preserved indefinitely; deletedAt/deletedById just excludes it
// from active listings, mirroring Payment.voidedAt from Phase 10.
export async function softDeleteExpense(
  ctx: AuthContext,
  expenseId: string,
  client: ExpenseWriteClient = prisma as unknown as ExpenseWriteClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const before = await client.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (before.deletedAt) {
    throw new ValidationError("This expense has already been deleted.");
  }

  const updated = await client.expense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date(), deletedById: ctx.userId },
  });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "EXPENSE_DELETED",
      entityType: "Expense",
      entityId: expenseId,
      previousValue: { deletedAt: null },
      newValue: { deletedAt: new Date().toISOString() },
      ipAddress: ctx.ip,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type CategoryTotal = { category: string; _sum: { amount: unknown } };

type ExpenseLister = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
  groupBy: (args: Record<string, unknown>) => Promise<CategoryTotal[]>;
};

export async function listExpenses(
  ctx: AuthContext,
  filters: ExpenseQuery,
  lister: ExpenseLister = prisma.expense as unknown as ExpenseLister,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const where: Record<string, unknown> = { deletedAt: null };
  if (filters.category) where.category = filters.category;
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [items, total, categoryTotals] = await Promise.all([
    lister.findMany({
      where,
      include: { createdBy: { select: { name: true } } },
      orderBy: { date: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    lister.count({ where }),
    lister.groupBy({ by: ["category"], where, _sum: { amount: true } }),
  ]);

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    categoryTotals: categoryTotals.map((row) => ({ category: row.category, total: Number(row._sum.amount ?? 0) })),
  };
}

type ExpenseReader = {
  findUniqueOrThrow: (args: Record<string, unknown>) => Promise<unknown>;
};

export async function getExpense(
  ctx: AuthContext,
  expenseId: string,
  reader: ExpenseReader = prisma.expense as unknown as ExpenseReader,
) {
  requireRole(ctx, "SUPER_ADMIN");
  return reader.findUniqueOrThrow({
    where: { id: expenseId },
    include: { createdBy: { select: { name: true } }, deletedBy: { select: { name: true } } },
  });
}

// ---------------------------------------------------------------------------
// Receipt attachment — reuses Phase 4's lib/storage.ts (R2/S3) rather than a new upload pipeline
// ---------------------------------------------------------------------------

const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

type UploadableFile = { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

export function assertValidExpenseAttachment(file: Pick<UploadableFile, "type" | "size">): void {
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    throw new ValidationError("Unsupported attachment type. Use JPEG, PNG, WebP, or PDF.");
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new ValidationError("Attachment exceeds the 10MB limit.");
  }
}

export async function uploadExpenseAttachment(
  ctx: AuthContext,
  expenseId: string,
  file: UploadableFile,
  client: ExpenseWriteClient = prisma as unknown as ExpenseWriteClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  assertValidExpenseAttachment(file);

  const expense = await client.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.deletedAt) {
    throw new ValidationError("Cannot attach a receipt to a deleted expense.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const key = `expenses/${expenseId}/receipt-${crypto.randomUUID()}.${extension}`;
  const url = await uploadToStorage(key, buffer, file.type);

  const updated = await client.expense.update({ where: { id: expenseId }, data: { attachmentUrl: url } });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "EXPENSE_ATTACHMENT_UPLOADED",
      entityType: "Expense",
      entityId: expenseId,
      newValue: { attachmentUrl: url },
      ipAddress: ctx.ip,
    },
  });

  return updated;
}
