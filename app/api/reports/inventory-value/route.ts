import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { getInventoryValue } from "@/lib/services/accounting.service";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const value = await getInventoryValue(ctx);
    return NextResponse.json(value);
  } catch (error) {
    return errorResponse(error);
  }
}
