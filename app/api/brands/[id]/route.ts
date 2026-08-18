import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { updateBrand } from "@/lib/services/brand.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const brand = await updateBrand(ctx, id, await request.json());
    return NextResponse.json(brand);
  } catch (error) {
    return errorResponse(error);
  }
}
