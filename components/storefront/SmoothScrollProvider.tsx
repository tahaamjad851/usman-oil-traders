"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";

// Storefront-only (wired up in app/(storefront)/layout.tsx) — the admin dashboard keeps native
// scroll, since staff doing fast data entry don't want inertia/easing in the way.
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Checked once on mount rather than an also-generally-unnecessary change listener — if this
    // was set, respect it outright rather than merely damping Lenis's own smoothing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return <>{children}</>;
}
