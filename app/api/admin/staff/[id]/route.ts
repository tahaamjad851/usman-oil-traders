import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { deactivateStaffAccount } from "@/lib/services/staff.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    const staff = await deactivateStaffAccount(ctx, id);
    return NextResponse.json(staff);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
