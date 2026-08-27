import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { listCustomersWithBalance } from "@/lib/services/customer.service";
import { customerQuerySchema } from "@/lib/validation/customer.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = customerQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listCustomersWithBalance(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
