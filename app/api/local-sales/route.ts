import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createLocalSale, listLocalSales } from "@/lib/services/local-sale.service";
import { localSaleQuerySchema } from "@/lib/validation/local-sale.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = localSaleQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listLocalSales(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const sale = await createLocalSale(ctx, await request.json());
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
