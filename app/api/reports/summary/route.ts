import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { getProfitSummary } from "@/lib/services/accounting.service";
import { reportQuerySchema } from "@/lib/validation/report.schema";

import { resolveReportRange } from "../resolve-range";

// SUPER_ADMIN only, enforced inside getProfitSummary (and every function it calls).
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const query = reportQuerySchema.parse(Object.fromEntries(searchParams));
    const range = resolveReportRange(query);
    const summary = await getProfitSummary(ctx, range);
    return NextResponse.json({ range, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}
