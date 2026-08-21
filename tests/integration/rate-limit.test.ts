import { afterAll, describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/api/rate-limit";
import { redis } from "@/lib/redis";

afterAll(async () => {
  await redis.quit();
});

// Every prior phase's rate-limit tests injected a fake in-memory store, which proves the counting
// logic is correct but can't prove the limiter actually persists state across separate requests —
// a real HTTP request is a fresh call into this module each time, so if the underlying Redis
// connection or key/TTL scheme were subtly wrong, a mocked store would never reveal it.
describe("Rate limiter against a real Redis (Phase 14)", () => {
  it("blocks once maxRequests is exceeded within the window, using the real default Redis client", async () => {
    const limiter = createRateLimiter(`test-${Date.now()}`, { windowSeconds: 60, maxRequests: 3 });
    const identifier = "203.0.113.7";

    expect(await limiter.consume(identifier)).toBe(true);
    expect(await limiter.consume(identifier)).toBe(true);
    expect(await limiter.consume(identifier)).toBe(true);
    expect(await limiter.consume(identifier)).toBe(false);
    expect(await limiter.consume(identifier)).toBe(false);
  });

  it("tracks each identifier independently under the same bucket", async () => {
    const limiter = createRateLimiter(`test-${Date.now()}`, { windowSeconds: 60, maxRequests: 1 });

    expect(await limiter.consume("1.1.1.1")).toBe(true);
    expect(await limiter.consume("1.1.1.1")).toBe(false);
    // A different identifier under the same limiter has never consumed anything yet.
    expect(await limiter.consume("2.2.2.2")).toBe(true);
  });

  it("the window actually expires in real Redis, not just in the count logic", async () => {
    const limiter = createRateLimiter(`test-${Date.now()}`, { windowSeconds: 1, maxRequests: 1 });
    const identifier = "198.51.100.9";

    expect(await limiter.consume(identifier)).toBe(true);
    expect(await limiter.consume(identifier)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(await limiter.consume(identifier)).toBe(true);
  });
});
