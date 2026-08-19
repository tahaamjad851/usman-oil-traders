import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createOrder, listOrders } from "@/lib/services/order.service";
import { orderQuerySchema } from "@/lib/validation/order.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = orderQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listOrders(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

// Public — guest checkout, no authentication. Every price/stock check happens server-side inside
// createOrder(); nothing from the client's cart is trusted.
export async function POST(request: Request) {
  try {
    const order = await createOrder(await request.json());
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
