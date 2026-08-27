import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono, Inter, Oswald } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Storefront-only typefaces (admin keeps Geist). Loaded once at the root because next/font
// requires a Server Component, but only components under app/(storefront) actually reference
// the font-shop-* utility classes, so the admin dashboard's rendered typography is unaffected.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Usman Oil Traders",
    template: "%s | Usman Oil Traders",
  },
  description:
    "Genuine engine oils and parts for cars, motorcycles, and tractors in Kot Samaba, Rahim Yar Khan.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
