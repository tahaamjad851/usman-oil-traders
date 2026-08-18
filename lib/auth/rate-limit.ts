import "server-only";

import { redis } from "@/lib/redis";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

export type LoginRateLimitStore = {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
};

function key(ip: string, username: string): string {
  return `login_attempts:${ip}:${username}`;
}

export function createLoginRateLimiter(store: LoginRateLimitStore) {
  return {
    async check(ip: string, username: string): Promise<boolean> {
      const count = await store.get(key(ip, username));
      return !count || Number(count) < MAX_LOGIN_ATTEMPTS;
    },
    async recordFailure(ip: string, username: string): Promise<void> {
      const attempts = await store.incr(key(ip, username));
      if (attempts === 1) {
        await store.expire(key(ip, username), LOGIN_WINDOW_SECONDS);
      }
    },
    async reset(ip: string, username: string): Promise<void> {
      await store.del(key(ip, username));
    },
  };
}

const limiter = createLoginRateLimiter(redis);

export const checkLoginRateLimit = limiter.check;
export const recordLoginFailure = limiter.recordFailure;
export const resetLoginAttempts = limiter.reset;
