// Stub for "@/auth" in the test environment. The real next-auth (beta) package chain fails to
// resolve under vitest's plain-Node module resolution (a `next/server` import inside next-auth's
// own lib/env.js that only works under Next's bundler). Every test exercising getAuthContext
// injects its own readSession/readUser dependencies (see lib/auth/session.ts's DI parameters), so
// the real auth() is never actually invoked — this stub only exists so importing session.ts
// doesn't pull in the real next-auth chain at module-load time.
export async function auth(): Promise<never> {
  throw new Error("auth() stub invoked directly — inject readSession via getAuthContext's deps in tests instead.");
}
