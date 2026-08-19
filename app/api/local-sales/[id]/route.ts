import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { getLocalSale } from "@/lib/services/local-sale.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const sale = await getLocalSale(ctx, id);
    return NextResponse.json(sale);
  } catch (error) {
    return errorResponse(error);
  }
}
