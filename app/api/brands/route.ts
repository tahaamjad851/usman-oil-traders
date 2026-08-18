import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createBrand, listBrands } from "@/lib/services/brand.service";

export async function GET() {
  try {
    const brands = await listBrands();
    return NextResponse.json(brands);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const brand = await createBrand(ctx, await request.json());
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
