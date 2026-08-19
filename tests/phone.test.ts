import { describe, expect, it } from "vitest";

import { toWhatsAppNumber } from "@/lib/utils/phone";

describe("toWhatsAppNumber", () => {
  it("normalizes local 03XXXXXXXXX format", () => {
    expect(toWhatsAppNumber("03001234567")).toBe("923001234567");
  });

  it("normalizes local format with dashes/spaces", () => {
    expect(toWhatsAppNumber("0300-1234567")).toBe("923001234567");
    expect(toWhatsAppNumber("0300 123 4567")).toBe("923001234567");
  });

  it("normalizes +923XXXXXXXXX format", () => {
    expect(toWhatsAppNumber("+923001234567")).toBe("923001234567");
    expect(toWhatsAppNumber("+92 300 1234567")).toBe("923001234567");
  });

  it("passes through already-normalized 923XXXXXXXXX format", () => {
    expect(toWhatsAppNumber("923001234567")).toBe("923001234567");
  });

  it("normalizes the 0092 international-dialing-prefix form", () => {
    expect(toWhatsAppNumber("00923001234567")).toBe("923001234567");
  });

  it("normalizes a bare 10-digit number starting with 3", () => {
    expect(toWhatsAppNumber("3001234567")).toBe("923001234567");
  });

  it("returns null for invalid or incomplete input rather than throwing", () => {
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
    expect(toWhatsAppNumber("0300123456")).toBeNull(); // one digit short
    expect(toWhatsAppNumber("not a phone number")).toBeNull();
    expect(toWhatsAppNumber("021-1234567")).toBeNull(); // landline, not mobile
  });

  it("never throws on garbage input", () => {
    expect(() => toWhatsAppNumber("!!!")).not.toThrow();
    expect(() => toWhatsAppNumber("   ")).not.toThrow();
  });
});
