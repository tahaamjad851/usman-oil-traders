import path from "node:path";
import type { NextConfig } from "next";

// Product images live in admin-configured external storage (Phase 4's R2/S3), so the CSP's
// img-src has to allow that origin — read from the same env var the storage wrapper itself uses
// (lib/storage.ts's S3_PUBLIC_BASE_URL) rather than hardcoding a provider-specific domain.
const storageOrigin = (() => {
  try {
    return process.env.S3_PUBLIC_BASE_URL ? new URL(process.env.S3_PUBLIC_BASE_URL).origin : "";
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `img-src 'self' data: ${storageOrigin}`.trim(),
  // Next.js injects inline styles/scripts for hydration; a nonce-based CSP would tighten this
  // further but needs per-request middleware wiring — noted here as a follow-up rather than
  // attempted as a same-pass change that could break rendering without a live browser to verify.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // No CORS headers are set anywhere in this app (verified: nothing writes
  // Access-Control-Allow-Origin), which is the strictest possible default — the browser blocks
  // cross-origin requests to these routes entirely rather than needing an explicit allowlist.
  //
  // HSTS (Strict-Transport-Security) is intentionally NOT set here yet — it should only ship once
  // the production TLS/domain setup is confirmed stable, per Phase 1's deployment plan, so it
  // doesn't lock in HTTPS before a cert is verified working.
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
