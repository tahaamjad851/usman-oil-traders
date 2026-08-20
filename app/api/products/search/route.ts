import { NextResponse } from "next/server";

import { productSearchRateLimiter } from "@/lib/api/rate-limit";
import { errorResponse, optionalAuthContext, rateLimitResponse, requestIp } from "@/lib/api/route-helpers";
import { searchProducts } from "@/lib/services/search.service";
import { productSearchQuerySchema } from "@/lib/validation/product.schema";

export async function GET(request: Request) {
  try {
    const ctx = await optionalAuthContext(request);

    // Only rate-limited for anonymous callers — this endpoint is also used by the staff-only POS
    // screen (Phase 9), which legitimately fires many rapid searches per minute at a busy counter.
    // An authenticated session is already accountable, so it's exempt.
    if (!ctx) {
      const ip = requestIp(request) ?? "unknown";
      const allowed = await productSearchRateLimiter.consume(ip);
      if (!allowed) return rateLimitResponse();
    }

    const { searchParams } = new URL(request.url);
    const filters = productSearchQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await searchProducts(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
