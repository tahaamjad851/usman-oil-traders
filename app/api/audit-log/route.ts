import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/services/audit-log.service";
import { auditLogQuerySchema } from "@/lib/validation/audit-log.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = auditLogQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listAuditLogs(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
