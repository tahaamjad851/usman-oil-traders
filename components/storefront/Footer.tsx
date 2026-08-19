import { MapPin, MessageCircle } from "lucide-react";

import { getWhatsAppNumber, whatsAppLink } from "@/lib/services/settings.service";

export async function Footer() {
  const whatsapp = await getWhatsAppNumber();

  return (
    <footer className="border-t border-shop-ink/5 bg-shop-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="font-shop-display text-lg uppercase tracking-wide text-shop-ink">Visit us</h2>
            <p className="mt-2 flex items-start gap-2 text-sm text-shop-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-shop-amber" aria-hidden="true" />
              <span>Kot Samaba, Rahim Yar Khan, Punjab, Pakistan</span>
            </p>
          </div>
          <div>
            <h2 className="font-shop-display text-lg uppercase tracking-wide text-shop-ink">Get in touch</h2>
            {whatsapp ? (
              <a
                href={whatsAppLink(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm text-shop-green hover:underline"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Message us on WhatsApp
              </a>
            ) : (
              <p className="mt-2 text-sm text-shop-muted">Contact details coming soon.</p>
            )}
          </div>
        </div>
        <p className="mt-8 text-xs text-shop-muted">
          © {new Date().getFullYear()} Usman Oil Traders. Prices shown are indicative — final
          price and delivery are confirmed via WhatsApp.
        </p>
      </div>
    </footer>
  );
}
