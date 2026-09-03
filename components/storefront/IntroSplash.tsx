"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "intro-splash-shown";
// Text starts its fade/scale-in shortly after mount (a tick after the initial paint, so the
// browser actually renders the "not yet in" state first and the CSS transition has something to
// animate from) — timings are tuned to land the whole thing around ~1.6s total, since this is a
// shop homepage that needs to get out of the way quickly, not a cinematic brand reveal.
const TEXT_IN_DELAY_MS = 50;
const HOLD_MS = 1100;
const FADE_OUT_MS = 500;

type Phase = "deciding" | "playing" | "fading" | "hidden";

// The overlay is rendered by default (this is what the server-rendered HTML contains, before any
// JS has run) rather than conditionally added — that's what makes this flash-free: the real
// homepage mounts underneath normally while this already covers it, and the effect below only
// ever *dismisses* it early (returning visitor within the session, or reduced-motion), never adds
// it late. Gating the initial render on sessionStorage instead would mean the browser paints the
// real page first and the overlay would visibly snap on top once JS loads.
export function IntroSplash() {
  const [phase, setPhase] = useState<Phase>("deciding");
  const [textIn, setTextIn] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    // Guards against React Strict Mode's dev-only double-invocation of effects on mount: without
    // this, the first invocation writes the sessionStorage flag, and the immediate second
    // invocation would then read its own flag back and think a previous visit already played
    // this, flipping straight to "hidden" before anything is shown.
    if (decided.current) return;
    decided.current = true;

    const skip =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      sessionStorage.getItem(SESSION_KEY) !== null;

    if (skip) {
      // Syncing React state to external systems' current values (the media query and
      // sessionStorage) — the same canonical case RevealOnScroll's reduced-motion check and
      // ProductSearch's debounce effect already have this rule disabled for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("hidden");
      return;
    }

    // Set the moment the animation actually starts, not after it finishes — a second homepage
    // visit that lands mid-animation (e.g. a fast back/forward navigation) still shouldn't replay.
    sessionStorage.setItem(SESSION_KEY, "1");
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const textInTimer = setTimeout(() => setTextIn(true), TEXT_IN_DELAY_MS);
    const fadeTimer = setTimeout(() => setPhase("fading"), HOLD_MS);
    return () => {
      clearTimeout(textInTimer);
      clearTimeout(fadeTimer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "fading") return;
    const doneTimer = setTimeout(() => setPhase("hidden"), FADE_OUT_MS);
    return () => clearTimeout(doneTimer);
  }, [phase]);

  // Fully unmounted once done — nothing left in the DOM to catch a stray click.
  if (phase === "hidden") return null;

  return (
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-shop-bg transition-opacity duration-500 ease-out ${
        phase === "fading" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <p
        className={`px-6 text-center font-shop-display text-4xl font-semibold uppercase tracking-[0.2em] text-shop-ink transition-all duration-700 ease-out sm:text-6xl ${
          textIn ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        Usman <span className="text-shop-red">Oil</span> Traders
      </p>
    </div>
  );
}
