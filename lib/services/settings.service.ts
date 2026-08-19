import "server-only";

import { prisma } from "@/lib/db";
import { toWhatsAppNumber } from "@/lib/utils/phone";

type SettingRecord = { key: string; value: string; isPublic: boolean };

type SettingsReader = {
  findUnique: (args: { where: { key: string } }) => Promise<SettingRecord | null>;
};

// Settings.isPublic is the gate: a setting only reaches unauthenticated storefront code if an
// admin explicitly marked it public, so adding a new admin-only setting later can never
// accidentally leak onto the public site by default.
export async function getPublicSetting(
  key: string,
  reader: SettingsReader = prisma.settings as unknown as SettingsReader,
): Promise<string | null> {
  const setting = await reader.findUnique({ where: { key } });
  if (!setting || !setting.isPublic) return null;
  return setting.value;
}

const WHATSAPP_SETTING_KEY = "whatsapp_number";

export async function getWhatsAppNumber(reader?: SettingsReader): Promise<string | null> {
  const fromSettings = await getPublicSetting(WHATSAPP_SETTING_KEY, reader);
  return fromSettings ?? process.env.WHATSAPP_BUSINESS_PHONE ?? null;
}

// Returns null (never a malformed URL) when the number doesn't normalize to a valid Pakistani
// mobile number — callers must handle that by not rendering the link, per the "never generate a
// broken wa.me link" rule.
export function whatsAppLink(number: string, message?: string): string | null {
  const normalized = toWhatsAppNumber(number);
  if (!normalized) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normalized}${query}`;
}
