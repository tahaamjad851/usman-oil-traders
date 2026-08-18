// Next.js aliases the real "server-only" package to a no-op at build time so it can be
// imported from server-side modules without throwing. Vitest runs those same modules
// under plain Node, so this stub reproduces that aliasing for the test environment.
export {};
