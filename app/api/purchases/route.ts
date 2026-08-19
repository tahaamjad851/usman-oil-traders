import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createPurchase, listPurchases } from "@/lib/services/purchase.service";
import { purchaseQuerySchema } from "@/lib/validation/purchase.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = purchaseQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listPurchases(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const purchase = await createPurchase(ctx, await request.json());
    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
