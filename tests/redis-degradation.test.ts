import { afterEach, beforeEach, describe, expect, it } from "vitest";

// REDIS_URL is a deliberately deferred, optional config for the initial launch (Phase 15) — its
// absence must disable rate limiting, not break login/checkout/search. See lib/redis.ts.
describe("rate limiting degrades gracefully with no REDIS_URL configured", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (originalRedisUrl !== undefined) process.env.REDIS_URL = originalRedisUrl;
  });

  it("never blocks and never throws for the login rate limiter", async () => {
    const { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } = await import("@/lib/auth/rate-limit");

    await expect(checkLoginRateLimit("203.0.113.1", "someone")).resolves.toBe(true);
    await expect(recordLoginFailure("203.0.113.1", "someone")).resolves.toBeUndefined();
    await expect(resetLoginAttempts("203.0.113.1", "someone")).resolves.toBeUndefined();
  });

  it("never blocks and never throws for the public API rate limiters", async () => {
    const { orderCreationRateLimiter, productSearchRateLimiter } = await import("@/lib/api/rate-limit");

    await expect(orderCreationRateLimiter.consume("203.0.113.1")).resolves.toBe(true);
    await expect(productSearchRateLimiter.consume("203.0.113.1")).resolves.toBe(true);
  });
});
