import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/types/auth";

export function requestIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

/**
 * For public-facing GET endpoints: an unauthenticated or non-viable session
 * (expired, inactive, must-change-password) is treated the same as an
 * anonymous storefront visitor rather than as a hard failure.
 */
export async function optionalAuthContext(request: Request): Promise<AuthContext | null> {
  try {
    return await getAuthContext({ ip: requestIp(request) });
  } catch {
    return null;
  }
}

export function errorResponse(error: unknown) {
  const status =
    error instanceof Error && "status" in error ? Number((error as { status: unknown }).status) : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Server error" },
    { status },
  );
}
