import "server-only";

// Both message builders below are typed to accept only the fields they're allowed to use —
// orderNumber, customerName, and item name/quantity — so there is no field on the type a future
// edit could accidentally read purchasePrice, unitPrice, or any internal id from.
export type WhatsAppMessageItem = { productName: string; quantity: number };

export type OrderForCustomerMessage = {
  orderNumber: string;
  items: WhatsAppMessageItem[];
};

export type OrderForStaffMessage = {
  orderNumber: string;
  customerName: string;
  items: WhatsAppMessageItem[];
};

function formatItemLines(items: WhatsAppMessageItem[]): string {
  return items.map((item) => `- ${item.productName} x${item.quantity}`).join("\n");
}

// Customer -> Business: shown as the deep-link button on the order confirmation view (Phase 7's
// in-place checkout success state). The customer taps this to confirm, in their own WhatsApp,
// that they placed the order and want to finalize price/delivery — no prices, no internal ids.
export function buildCustomerConfirmationMessage(order: OrderForCustomerMessage): string {
  return [
    `Hi, I just placed order ${order.orderNumber} on your website.`,
    "",
    formatItemLines(order.items),
    "",
    "Can you please confirm availability and the final price with delivery?",
  ].join("\n");
}

// Staff -> Customer: opened from the admin order detail page to reach out to the customer
// directly, prompting them to confirm delivery address and get final pricing.
export function buildStaffContactMessage(order: OrderForStaffMessage): string {
  return [
    `Hi ${order.customerName}, this is Usman Oil Traders regarding your order ${order.orderNumber}.`,
    "",
    formatItemLines(order.items),
    "",
    "Could you please confirm your delivery address so we can share the final price and delivery charges?",
  ].join("\n");
}
