// Normalizes a Pakistani mobile number into the bare-digits international format wa.me deep
// links require (e.g. "923001234567" for +92 300 1234567). Accepts local "03XXXXXXXXX",
// international "+923XXXXXXXXX" / "923XXXXXXXXX" / "00923XXXXXXXXX", and tolerates spaces,
// dashes, and parentheses. Used for both the business number (Settings) and customer numbers
// (Order) — one utility, one normalization rule, so the two can never drift apart.
//
// Returns null — never throws — for anything that isn't a recognizable Pakistani mobile number,
// so a malformed number degrades to "no WhatsApp link shown" rather than a broken deep link.
const PK_MOBILE_INTERNATIONAL = /^923\d{9}$/;

export function toWhatsAppNumber(rawNumber: string): string | null {
  const digits = rawNumber.trim().replace(/[^\d]/g, "");
  if (!digits) return null;

  let candidate: string;
  if (digits.startsWith("0092")) {
    candidate = digits.slice(2);
  } else if (digits.startsWith("92")) {
    candidate = digits;
  } else if (digits.startsWith("0")) {
    candidate = `92${digits.slice(1)}`;
  } else if (digits.startsWith("3")) {
    candidate = `92${digits}`;
  } else {
    candidate = digits;
  }

  return PK_MOBILE_INTERNATIONAL.test(candidate) ? candidate : null;
}
