import { AuthContext, AppRole } from "@/types/auth";

export class UnauthorizedError extends Error {
  status = 401;

  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;

  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PasswordChangeRequiredError extends Error {
  status = 403;

  constructor(message: string) {
    super(message);
    this.name = "PasswordChangeRequiredError";
  }
}

export function requireRole(ctx: AuthContext, role: AppRole): void {
  if (ctx.role !== role) {
    throw new ForbiddenError(`Requires ${role}`);
  }
}

export function requireAnyRole(ctx: AuthContext, roles: AppRole[]): void {
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
  }
}

export function requirePasswordChanged(ctx: AuthContext): void {
  if (ctx.mustChangePassword) {
    throw new PasswordChangeRequiredError(
      "A password change is required before continuing.",
    );
  }
}
