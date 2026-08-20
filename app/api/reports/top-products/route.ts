import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { getTopProducts } from "@/lib/services/accounting.service";
import { topProductsQuerySchema } from "@/lib/validation/report.schema";

import { resolveReportRange } from "../resolve-range";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const query = topProductsQuerySchema.parse(Object.fromEntries(searchParams));
    const range = resolveReportRange(query);
    const items = await getTopProducts(ctx, range, query.limit);
    return NextResponse.json({ range, items });
  } catch (error) {
    return errorResponse(error);
  }
}
