import "server-only";

import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

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

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
