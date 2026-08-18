import "server-only";

import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL must be configured.");
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
