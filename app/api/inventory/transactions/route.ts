import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { listInventoryTransactions } from "@/lib/services/inventory.service";
import { inventoryTransactionQuerySchema } from "@/lib/validation/inventory.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = inventoryTransactionQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listInventoryTransactions(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
