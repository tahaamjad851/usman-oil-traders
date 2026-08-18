import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { deleteProductImage } from "@/lib/services/image.service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; imgId: string }> },
) {
  try {
    const { id, imgId } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    await deleteProductImage(ctx, id, imgId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
