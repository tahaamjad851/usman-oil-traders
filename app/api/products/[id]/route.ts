import { NextResponse } from "next/server";

import { errorResponse, optionalAuthContext, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { discontinueProduct, getProduct, updateProduct } from "@/lib/services/product.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await optionalAuthContext(request);
    const product = await getProduct(ctx, id);
    return NextResponse.json(product);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const product = await updateProduct(ctx, id, await request.json());
    return NextResponse.json(product);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const product = await discontinueProduct(ctx, id);
    return NextResponse.json(product);
  } catch (error) {
    return errorResponse(error);
  }
}
