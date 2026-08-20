import "server-only";

import { redis } from "@/lib/redis";

export type RateLimitStore = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export type RateLimitConfig = { windowSeconds: number; maxRequests: number };

// Same fixed-window counter mechanism as the login rate limiter (lib/auth/rate-limit.ts —
// increment, set an expiry only on the first hit in the window), generalized here for any
// bucket/identifier pair rather than duplicated per endpoint. Used for the public,
// unauthenticated routes a random internet visitor can hit repeatedly without an account:
// guest order creation and product search.
export function createRateLimiter(bucket: string, config: RateLimitConfig, store: RateLimitStore = redis) {
  return {
    async consume(identifier: string): Promise<boolean> {
      const key = `ratelimit:${bucket}:${identifier}`;
      const count = await store.incr(key);
      if (count === 1) {
        await store.expire(key, config.windowSeconds);
      }
      return count <= config.maxRequests;
    },
  };
}

// 10 orders per 10 minutes per IP — generous for a genuine customer placing (and maybe redoing) a
// real order, restrictive enough to make automated order-spam impractical.
export const orderCreationRateLimiter = createRateLimiter("orders:create", { windowSeconds: 600, maxRequests: 10 });

// 60 searches per minute per IP — a real shopper typing/browsing normally never approaches this;
// it's aimed at scripted scraping/abuse, not ordinary use.
export const productSearchRateLimiter = createRateLimiter("products:search", { windowSeconds: 60, maxRequests: 60 });
