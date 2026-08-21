import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/integration/pg-test-server";
import { TEST_REDIS_URL } from "./tests/integration/redis-test-server";

export default defineConfig({
  resolve: {
    alias: {
      // Same ordering constraint as vitest.config.ts: the specific "@/auth" alias must be listed
      // before the general "@" prefix alias or it never gets reached.
      "@/auth": path.resolve(__dirname, "tests/stubs/auth.ts"),
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // Every integration test file shares the one disposable Postgres instance globalSetup starts.
    // Running test files in parallel would mean two files racing to seed/read the same tables at
    // once with no isolation between them — sequential execution trades some wall-clock time for
    // tests that are actually reliable.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: TEST_REDIS_URL,
    },
  },
});
