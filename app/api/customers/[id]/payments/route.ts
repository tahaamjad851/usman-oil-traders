import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { recordCustomerPayment } from "@/lib/services/customer.service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const payment = await recordCustomerPayment(ctx, id, await request.json());
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
