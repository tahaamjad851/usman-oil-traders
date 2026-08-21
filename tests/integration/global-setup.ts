import { execFileSync } from "node:child_process";
import { startTestPostgres, stopTestPostgres, TEST_DATABASE_URL } from "./pg-test-server";
import { startTestRedis, stopTestRedis } from "./redis-test-server";

// Vitest's globalSetup runs once, in a separate process, before any integration test file
// executes. It is the right place to boot the disposable Postgres and Redis instances and apply
// the schema — individual test files then talk to those already-running services via the fixed
// TEST_DATABASE_URL / TEST_REDIS_URL baked into vitest.integration.config.ts's `test.env`.
export default async function globalSetup() {
  const pgHandle = await startTestPostgres();
  const redis = await startTestRedis();

  try {
    // --url bypasses prisma.config.ts's own dotenv-loaded DATABASE_URL entirely, rather than
    // relying on env-var precedence between this process and the one npx spawns.
    execFileSync("npx", ["prisma", "db", "push", "--accept-data-loss", "--url", TEST_DATABASE_URL], {
      stdio: "inherit",
      shell: true,
    });
  } catch (error) {
    await Promise.all([stopTestPostgres(pgHandle), stopTestRedis(redis)]);
    throw error;
  }

  return async () => {
    await Promise.all([stopTestPostgres(pgHandle), stopTestRedis(redis)]);
  };
}
