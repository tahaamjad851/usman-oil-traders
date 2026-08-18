import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { updateCategory } from "@/lib/services/category.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const category = await updateCategory(ctx, id, await request.json());
    return NextResponse.json(category);
  } catch (error) {
    return errorResponse(error);
  }
}
