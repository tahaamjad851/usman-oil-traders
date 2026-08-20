import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  PasswordChangeRequiredError,
  UnauthorizedError,
} from "@/lib/auth/guard";
import type { AuthContext } from "@/types/auth";

type SessionUser = {
  id: string;
  username: string;
  role: AuthContext["role"];
  isActive: boolean;
  mustChangePassword: boolean;
};

type SessionReader = () => Promise<{ user?: { id?: string } } | null>;
type UserReader = (userId: string) => Promise<SessionUser | null>;

const defaultUserReader: UserReader = (userId) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  });

export async function getAuthContext(
  options?: { ip?: string; allowPasswordChange?: boolean },
  deps?: { readSession?: SessionReader; readUser?: UserReader },
): Promise<AuthContext> {
  const readSession = deps?.readSession ?? auth;
  const readUser = deps?.readUser ?? defaultUserReader;

  const session = await readSession();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Authentication required.");
  }

  const user = await readUser(session.user.id);

  // Re-read from the database on every call rather than trusted off the JWT's own claims — this
  // is what makes a deactivated account's still-cryptographically-valid session token get
  // rejected on its very next request, not just at its next login attempt (Phase 13).
  if (!user?.isActive) {
    throw new UnauthorizedError("Authentication required.");
  }

  if (user.mustChangePassword && !options?.allowPasswordChange) {
    throw new PasswordChangeRequiredError(
      "A password change is required before continuing.",
    );
  }

  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    ip: options?.ip,
  };
}
