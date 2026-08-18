import { NextResponse } from "next/server";

import { errorResponse, optionalAuthContext } from "@/lib/api/route-helpers";
import { searchProducts } from "@/lib/services/search.service";
import { productSearchQuerySchema } from "@/lib/validation/product.schema";

export async function GET(request: Request) {
  try {
    const ctx = await optionalAuthContext(request);
    const { searchParams } = new URL(request.url);
    const filters = productSearchQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await searchProducts(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
