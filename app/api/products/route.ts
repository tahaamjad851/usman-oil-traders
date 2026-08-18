import { NextResponse } from "next/server";

import { errorResponse, optionalAuthContext, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createProduct, listProducts } from "@/lib/services/product.service";
import { productSearchQuerySchema } from "@/lib/validation/product.schema";

export async function GET(request: Request) {
  try {
    const ctx = await optionalAuthContext(request);
    const { searchParams } = new URL(request.url);
    const filters = productSearchQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listProducts(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const product = await createProduct(ctx, await request.json());
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
