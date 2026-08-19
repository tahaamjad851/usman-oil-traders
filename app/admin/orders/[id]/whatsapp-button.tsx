"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

// Clicking this opens the customer's WhatsApp chat in a new tab (the current page stays alive)
// and — automatically, no confirmation step — also marks the order WHATSAPP_CONTACTED, but only
// when it's still NEW. That guard matters: re-opening this link later to message a customer
// again about an order that's already PRICE_CONFIRMED (or further) must never move its status
// backward, since PRICE_CONFIRMED is what commits stock (Phase 7).
export function WhatsAppCustomerButton({
  orderId,
  currentStatus,
  whatsappLink,
}: {
  orderId: string;
  currentStatus: string;
  whatsappLink: string;
}) {
  const router = useRouter();

  async function handleClick() {
    if (currentStatus !== "NEW") return;
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "WHATSAPP_CONTACTED" }),
      });
      router.refresh();
    } catch {
      // Non-fatal — the WhatsApp tab still opens even if this background status update fails.
    }
  }

  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Message customer on WhatsApp
    </a>
  );
}
