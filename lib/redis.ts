import "server-only";

import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

// Redis is an accepted, deliberate gap for the initial low-traffic launch (Phase 15) — every
// caller of `redis` today only uses it for rate limiting (defense-in-depth, not core
// functionality). REDIS_URL being unset must never break login, checkout, or search.
export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL must be configured.");
  }
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

// The REDIS_URL check must not run at module-eval time: Next's `next build` imports every
// route module (transitively including this one) during page-data collection, with no request
// in flight and no Redis command ever issued. Deferring client construction behind a Proxy —
// created only the first time a caller actually invokes a method like `redis.incr(...)` — lets
// `next build` succeed without REDIS_URL set, while still throwing the same error as before the
// first time anything actually tries to talk to Redis at runtime.
function getRedisClient(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;
  const client = createRedisClient();
  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = client;
  }
  return client;
}

// The only methods the two rate limiters (lib/auth/rate-limit.ts, lib/api/rate-limit.ts) call on
// this client. Each fallback resolves to "nothing has ever been recorded yet" — get -> null,
// incr -> 1, expire/del -> no-op acks — so `count < maxRequests` stays true and a limiter backed
// by this fallback simply never blocks, instead of throwing and taking login/checkout/search down
// with it.
const noopFallbacks: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  get: async () => null,
  incr: async () => 1,
  expire: async () => 1,
  del: async () => 0,
};

let warnedMissingRedis = false;

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!isRedisConfigured()) {
      if (!warnedMissingRedis) {
        warnedMissingRedis = true;
        console.warn(
          "[redis] REDIS_URL is not configured — rate limiting is disabled and requests will not be throttled. Expected for the current launch (Phase 15 deferred this deliberately); revisit once traffic grows.",
        );
      }
      const fallback = typeof prop === "string" ? noopFallbacks[prop] : undefined;
      if (fallback) return fallback;
      throw new Error(
        `REDIS_URL is not configured; the "${String(prop)}" Redis operation has no fallback and is unavailable.`,
      );
    }

    const client = getRedisClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
