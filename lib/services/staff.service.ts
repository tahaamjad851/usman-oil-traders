import "server-only";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema, createStaffSchema } from "@/lib/validation/auth";
import type { AuthContext } from "@/types/auth";

export async function createStaffAccount(
  ctx: AuthContext,
  input: unknown,
) {
  requireRole(ctx, "SUPER_ADMIN");
  const data = createStaffSchema.parse(input);
  const passwordHash = await hashPassword(data.temporaryPassword);

  return prisma.$transaction(async (tx) => {
    const staff = await tx.user.create({
      data: {
        name: data.name,
        username: data.username,
        email: data.email,
        passwordHash,
        role: "STAFF",
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: staff.id,
        newValue: { role: "STAFF", username: staff.username },
        ipAddress: ctx.ip,
      },
    });

    return staff;
  });
}

export async function listStaffAccounts(ctx: AuthContext) {
  requireRole(ctx, "SUPER_ADMIN");

  return prisma.user.findMany({
    where: { role: "STAFF" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function deactivateStaffAccount(ctx: AuthContext, staffId: string) {
  requireRole(ctx, "SUPER_ADMIN");

  if (ctx.userId === staffId) {
    throw new ValidationError("An owner cannot deactivate their own account.");
  }

  return prisma.$transaction(async (tx) => {
    const staff = await tx.user.findUniqueOrThrow({
      where: { id: staffId },
      select: { id: true, role: true, isActive: true, username: true },
    });

    if (staff.role !== "STAFF") {
      throw new ValidationError("Only staff accounts can be deactivated here.");
    }

    const updated = await tx.user.update({
      where: { id: staff.id },
      data: { isActive: false },
      select: { id: true, username: true, role: true, isActive: true },
    });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "USER_DEACTIVATED",
        entityType: "User",
        entityId: staff.id,
        previousValue: { isActive: staff.isActive },
        newValue: { isActive: false },
        ipAddress: ctx.ip,
      },
    });

    return updated;
  });
}

export async function reactivateStaffAccount(ctx: AuthContext, staffId: string) {
  requireRole(ctx, "SUPER_ADMIN");

  return prisma.$transaction(async (tx) => {
    const staff = await tx.user.findUniqueOrThrow({
      where: { id: staffId },
      select: { id: true, role: true, isActive: true, username: true },
    });

    if (staff.role !== "STAFF") {
      throw new ValidationError("Only staff accounts can be reactivated here.");
    }

    const updated = await tx.user.update({
      where: { id: staff.id },
      data: { isActive: true },
      select: { id: true, username: true, role: true, isActive: true },
    });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "USER_REACTIVATED",
        entityType: "User",
        entityId: staff.id,
        previousValue: { isActive: staff.isActive },
        newValue: { isActive: true },
        ipAddress: ctx.ip,
      },
    });

    return updated;
  });
}

export async function changeOwnPassword(ctx: AuthContext, input: unknown) {
  const data = changePasswordSchema.parse(input);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { id: true, username: true, passwordHash: true },
  });

  if (data.newPassword.toLowerCase() === user.username.toLowerCase()) {
    throw new ValidationError("Password must not match the username.");
  }

  if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
    throw new ValidationError("Current password is incorrect.");
  }

  const passwordHash = await hashPassword(data.newPassword);

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: ctx.userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "PASSWORD_CHANGED",
        entityType: "User",
        entityId: ctx.userId,
        ipAddress: ctx.ip,
      },
    });
  });
}
