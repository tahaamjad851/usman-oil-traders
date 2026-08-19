import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { ValidationError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { uploadExpenseAttachment } from "@/lib/services/expense.service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("An attachment file is required.");
    }
    const expense = await uploadExpenseAttachment(ctx, id, file);
    return NextResponse.json(expense);
  } catch (error) {
    return errorResponse(error);
  }
}
