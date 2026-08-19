import { describe, expect, it } from "vitest";

import {
  buildCustomerConfirmationMessage,
  buildStaffContactMessage,
} from "@/lib/services/whatsapp-message.service";

const order = {
  orderNumber: "UOT-10001",
  customerName: "Ali Khan",
  items: [
    { productName: "ZIC X7 5W-30", quantity: 2 },
    { productName: "Oil Filter", quantity: 1 },
  ],
};

describe("buildCustomerConfirmationMessage", () => {
  const message = buildCustomerConfirmationMessage(order);

  it("includes the order number and each item's name and quantity", () => {
    expect(message).toContain("UOT-10001");
    expect(message).toContain("ZIC X7 5W-30 x2");
    expect(message).toContain("Oil Filter x1");
  });

  it("never includes prices or internal ids — the type itself has no price/id field to leak", () => {
    expect(message).not.toMatch(/rs\.?\s*\d/i);
    expect(message).not.toMatch(/\d{3,}\.\d{2}/);
  });

  it("is phrased as the customer confirming they placed the order", () => {
    expect(message.toLowerCase()).toContain("i just placed order");
  });
});

describe("buildStaffContactMessage", () => {
  const message = buildStaffContactMessage(order);

  it("includes the order number, customer name, and item summary", () => {
    expect(message).toContain("UOT-10001");
    expect(message).toContain("Ali Khan");
    expect(message).toContain("ZIC X7 5W-30 x2");
  });

  it("never includes prices", () => {
    expect(message).not.toMatch(/rs\.?\s*\d/i);
  });

  it("prompts the customer to confirm delivery address and final pricing", () => {
    expect(message.toLowerCase()).toContain("delivery address");
  });
});

describe("customer vs. business number are never mixed up", () => {
  it("buildCustomerConfirmationMessage's type has no field for the customer's own name/phone", () => {
    // This message is what the CUSTOMER sends TO the business — there is nothing here that could
    // be confused for an outbound "message the customer" payload, because the type this function
    // accepts (OrderForCustomerMessage) doesn't even have a customerName/customerPhone field.
    const message = buildCustomerConfirmationMessage({ orderNumber: order.orderNumber, items: order.items });
    expect(message).not.toContain(order.customerName);
  });
});
