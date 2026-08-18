import "server-only";

import { prisma } from "@/lib/db";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
} from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import type { AppRole } from "@/types/auth";

export class LoginRateLimitError extends Error {}

type LoginUser = {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  role: AppRole;
  isActive: boolean;
};

export type CredentialsDependencies = {
  checkRateLimit: (ip: string, username: string) => Promise<boolean>;
  recordFailure: (ip: string, username: string) => Promise<void>;
  resetAttempts: (ip: string, username: string) => Promise<void>;
  findUser: (username: string) => Promise<LoginUser | null>;
  verify: (hash: string, password: string) => Promise<boolean>;
  recordSuccess: (user: LoginUser, ip: string) => Promise<void>;
  recordKnownFailure: (user: LoginUser, ip: string) => Promise<void>;
};

const dependencies: CredentialsDependencies = {
  checkRateLimit: checkLoginRateLimit,
  recordFailure: recordLoginFailure,
  resetAttempts: resetLoginAttempts,
  findUser: (username) => prisma.user.findUnique({ where: { username } }),
  verify: verifyPassword,
  async recordSuccess(user, ip) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
          ipAddress: ip,
        },
      });
    });
  },
  async recordKnownFailure(user, ip) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        ipAddress: ip,
      },
    });
  },
};

export async function authenticateCredentials(
  input: { username?: unknown; password?: unknown },
  ip: string,
  deps: CredentialsDependencies = dependencies,
): Promise<Omit<LoginUser, "passwordHash" | "isActive"> | null> {
  const username = String(input.username ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");

  if (!(await deps.checkRateLimit(ip, username))) {
    throw new LoginRateLimitError("TOO_MANY_ATTEMPTS");
  }

  const user = await deps.findUser(username);
  if (!user || !user.isActive) {
    await deps.recordFailure(ip, username);
    if (user) await deps.recordKnownFailure(user, ip);
    return null;
  }

  if (!(await deps.verify(user.passwordHash, password))) {
    await deps.recordFailure(ip, username);
    await deps.recordKnownFailure(user, ip);
    return null;
  }

  await deps.resetAttempts(ip, username);
  await deps.recordSuccess(user, ip);

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  };
}
