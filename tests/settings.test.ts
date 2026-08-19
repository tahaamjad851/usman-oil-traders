import { afterEach, describe, expect, it } from "vitest";

import { getPublicSetting, getWhatsAppNumber, whatsAppLink } from "@/lib/services/settings.service";

describe("getPublicSetting", () => {
  it("returns the value when the setting exists and is marked public", async () => {
    const reader = { findUnique: async () => ({ key: "whatsapp_number", value: "923001234567", isPublic: true }) };
    await expect(getPublicSetting("whatsapp_number", reader)).resolves.toBe("923001234567");
  });

  it("returns null when the setting exists but is not marked public", async () => {
    const reader = { findUnique: async () => ({ key: "internal_note", value: "secret", isPublic: false }) };
    await expect(getPublicSetting("internal_note", reader)).resolves.toBeNull();
  });

  it("returns null when the setting does not exist", async () => {
    const reader = { findUnique: async () => null };
    await expect(getPublicSetting("missing", reader)).resolves.toBeNull();
  });
});

describe("getWhatsAppNumber", () => {
  const originalEnv = process.env.WHATSAPP_BUSINESS_PHONE;

  afterEach(() => {
    process.env.WHATSAPP_BUSINESS_PHONE = originalEnv;
  });

  it("prefers the admin-configured public Settings value over the env var", async () => {
    process.env.WHATSAPP_BUSINESS_PHONE = "923000000000";
    const reader = { findUnique: async () => ({ key: "whatsapp_number", value: "923001234567", isPublic: true }) };
    await expect(getWhatsAppNumber(reader)).resolves.toBe("923001234567");
  });

  it("falls back to the env var when no public Settings value is configured", async () => {
    process.env.WHATSAPP_BUSINESS_PHONE = "923000000000";
    const reader = { findUnique: async () => null };
    await expect(getWhatsAppNumber(reader)).resolves.toBe("923000000000");
  });

  it("returns null when neither is configured", async () => {
    delete process.env.WHATSAPP_BUSINESS_PHONE;
    const reader = { findUnique: async () => null };
    await expect(getWhatsAppNumber(reader)).resolves.toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("strips non-digit characters and builds a wa.me link", () => {
    expect(whatsAppLink("+92 300 1234567")).toBe("https://wa.me/923001234567");
  });

  it("URL-encodes an optional prefilled message", () => {
    expect(whatsAppLink("923001234567", "Hi there!")).toBe(
      "https://wa.me/923001234567?text=Hi%20there!",
    );
  });
});
