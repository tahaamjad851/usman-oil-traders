import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { listUnifiedPayments } from "@/lib/services/payment.service";
import { paymentQuerySchema } from "@/lib/validation/payment.schema";

// SUPER_ADMIN only, enforced inside listUnifiedPayments — this is the aggregate
// cross-channel reconciliation view, not an individual order's payment history.
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = paymentQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listUnifiedPayments(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
