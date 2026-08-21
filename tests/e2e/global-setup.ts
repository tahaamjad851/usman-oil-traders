import { execFileSync, spawn, type ChildProcess } from "node:child_process";

import { startTestPostgres, stopTestPostgres, TEST_DATABASE_URL, type TestPostgresHandle } from "../integration/pg-test-server";
import { startTestRedis, stopTestRedis } from "../integration/redis-test-server";
import { TEST_REDIS_URL } from "../integration/redis-test-server";
import { E2E_APP_PORT, E2E_BASE_URL } from "./e2e-server";
import type RedisMemoryServer from "redis-memory-server";

// Everything the E2E suite needs — a real disposable Postgres, a real disposable Redis, a fresh
// `next build`, and `next start` serving that build — is orchestrated here rather than through
// Playwright's own `webServer` config, so the strict ordering (DB up -> schema pushed -> seeded ->
// build -> start) is guaranteed rather than raced against Playwright's own startup sequencing.
//
// Per this phase's own checklist ("E2E suite runs against a full build, not just dev mode, to
// catch build-time-only issues"), this really does run `next build` + `next start`, not `next dev`.

function killProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E2E server never became ready at ${url} within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  const pgHandle: TestPostgresHandle = await startTestPostgres();
  const redisServer: RedisMemoryServer = await startTestRedis();

  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    // .env has never had these filled in in this dev environment (auth was never exercised
    // against a real running server before this phase) — NextAuth refuses every request with
    // "UntrustedHost" without AUTH_TRUST_HOST, and refuses to even start signing sessions without
    // an AUTH_SECRET.
    AUTH_TRUST_HOST: "true",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-test-only-secret-do-not-use-in-production",
  };

  let serverProcess: ChildProcess | undefined;

  try {
    execFileSync("npx", ["prisma", "db", "push", "--accept-data-loss", "--url", TEST_DATABASE_URL], {
      stdio: "inherit",
      shell: true,
    });
    execFileSync("npx", ["tsx", "tests/e2e/seed.ts"], { stdio: "inherit", shell: true, env });
    execFileSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env });

    serverProcess = spawn("npx", ["next", "start", "-p", String(E2E_APP_PORT)], {
      shell: true,
      env,
      stdio: "inherit",
    });

    await waitForServer(E2E_BASE_URL);
  } catch (error) {
    if (serverProcess) killProcessTree(serverProcess);
    await Promise.all([stopTestPostgres(pgHandle), stopTestRedis(redisServer)]);
    throw error;
  }

  return async () => {
    if (serverProcess) killProcessTree(serverProcess);
    await Promise.all([stopTestPostgres(pgHandle), stopTestRedis(redisServer)]);
  };
}
