// Boots a real, disposable Redis server for integration tests — same rationale as
// pg-test-server.ts: a real binary running as a local child process, no Docker, no external
// service. Needed specifically to verify the rate limiter's counting/expiry actually persists
// across separate requests against a real Redis, not a mock `incr`/`expire` pair that can't
// reveal a wrong TTL or a wrong key scheme.
import { RedisMemoryServer } from "redis-memory-server";

export const TEST_REDIS_PORT = 55479;
export const TEST_REDIS_URL = `redis://127.0.0.1:${TEST_REDIS_PORT}`;

export async function startTestRedis(): Promise<RedisMemoryServer> {
  const server = new RedisMemoryServer({ instance: { port: TEST_REDIS_PORT } });
  await server.start();
  return server;
}

export async function stopTestRedis(server: RedisMemoryServer): Promise<void> {
  await server.stop();
}
