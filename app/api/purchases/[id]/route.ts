import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { getPurchase } from "@/lib/services/purchase.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const purchase = await getPurchase(ctx, id);
    return NextResponse.json(purchase);
  } catch (error) {
    return errorResponse(error);
  }
}
