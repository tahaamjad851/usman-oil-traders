import { NextResponse } from "next/server";

import { errorResponse, requestIp } from "@/lib/api/route-helpers";
import { getAuthContext } from "@/lib/auth/session";
import { createOrder, listOrders } from "@/lib/services/order.service";
import { getWhatsAppNumber, whatsAppLink } from "@/lib/services/settings.service";
import { buildCustomerConfirmationMessage } from "@/lib/services/whatsapp-message.service";
import { orderQuerySchema } from "@/lib/validation/order.schema";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext({ ip: requestIp(request) });
    const { searchParams } = new URL(request.url);
    const filters = orderQuerySchema.parse(Object.fromEntries(searchParams));
    const result = await listOrders(ctx, filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

// Public — guest checkout, no authentication. Every price/stock check happens server-side inside
// createOrder(); nothing from the client's cart is trusted.
export async function POST(request: Request) {
  try {
    const order = await createOrder(await request.json());

    // Built here rather than inside createOrder() so order creation itself stays a pure business
    // operation, unconcerned with WhatsApp/presentation. whatsappLink is null (not a broken URL)
    // whenever no business number is configured or it doesn't normalize to a valid PK mobile.
    const whatsappNumber = await getWhatsAppNumber();
    const whatsappLinkForOrder = whatsappNumber
      ? whatsAppLink(whatsappNumber, buildCustomerConfirmationMessage(order))
      : null;

    return NextResponse.json({ ...order, whatsappLink: whatsappLinkForOrder }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
