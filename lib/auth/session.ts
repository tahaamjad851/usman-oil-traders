import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  PasswordChangeRequiredError,
  UnauthorizedError,
} from "@/lib/auth/guard";
import type { AuthContext } from "@/types/auth";

export async function getAuthContext(options?: {
  ip?: string;
  allowPasswordChange?: boolean;
}): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Authentication required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  });

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
