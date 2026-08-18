import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { changeOwnPassword } from "@/lib/services/staff.service";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      allowPasswordChange: true,
    });
    await changeOwnPassword(ctx, await request.json());
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
