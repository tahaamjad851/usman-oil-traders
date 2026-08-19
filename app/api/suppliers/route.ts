import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createSupplier, listSuppliers } from "@/lib/services/supplier.service";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const suppliers = await listSuppliers(ctx);
    return NextResponse.json(suppliers);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const supplier = await createSupplier(ctx, await request.json());
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
