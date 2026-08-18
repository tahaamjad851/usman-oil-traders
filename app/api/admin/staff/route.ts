import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { createStaffAccount } from "@/lib/services/staff.service";

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const staff = await createStaffAccount(ctx, await request.json());
    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
