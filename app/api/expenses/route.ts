import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createExpense, listExpenses } from "@/lib/services/expense.service";
import { expenseQuerySchema } from "@/lib/validation/expense.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = expenseQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listExpenses(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const expense = await createExpense(ctx, await request.json());
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
