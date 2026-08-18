import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createCategory, listCategories } from "@/lib/services/category.service";

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json(categories);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const category = await createCategory(ctx, await request.json());
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
