import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { deactivateStaffAccount, reactivateStaffAccount } from "@/lib/services/staff.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    const body = await request.json().catch(() => ({}) as { action?: string });
    const staff =
      body?.action === "reactivate"
        ? await reactivateStaffAccount(ctx, id)
        : await deactivateStaffAccount(ctx, id);
    return NextResponse.json(staff);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
