// Boots a real, disposable PostgreSQL server for integration/concurrency tests — no Docker, no
// external service, no credentials to a pre-existing database. `embedded-postgres` downloads and
// runs an actual native Postgres binary (not a mock, not a WASM build) as a child process against
// a throwaway data directory, which is exactly what's needed to exercise real transactional
// row-locking under concurrent load (verified: a WASM alternative — PGlite over a socket bridge —
// was tried first and deadlocks under genuine cross-connection lock contention, since it only ever
// executes one query at a time internally; a real Postgres binary does not have that limitation).
//
// The port/user/password/db name are fixed constants (rather than dynamically chosen) so that
// vitest.integration.config.ts's static `test.env.DATABASE_URL` can point at the same instance
// this module starts, without needing to shuttle a dynamically-chosen port from globalSetup's
// process into the worker processes that actually run the tests.
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

export const TEST_PG_PORT = 55477;
export const TEST_PG_USER = "uot_test";
export const TEST_PG_PASSWORD = "uot_test";
export const TEST_PG_DATABASE = "uot_test";
export const TEST_DATABASE_URL = `postgresql://${TEST_PG_USER}:${TEST_PG_PASSWORD}@127.0.0.1:${TEST_PG_PORT}/${TEST_PG_DATABASE}?schema=public`;

export type TestPostgresHandle = { pg: EmbeddedPostgres; dataDir: string };

function freshDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uot-test-pgdata-"));
}

export async function startTestPostgres(): Promise<TestPostgresHandle> {
  const dataDir = freshDataDir();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: TEST_PG_PORT,
    user: TEST_PG_USER,
    password: TEST_PG_PASSWORD,
    persistent: false,
    onLog: () => {}, // the initdb/postgres process logs are noisy and not useful in test output
    onError: (err) => console.error("[test-postgres]", err),
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(TEST_PG_DATABASE);

  return { pg, dataDir };
}

export async function stopTestPostgres({ pg, dataDir }: TestPostgresHandle): Promise<void> {
  try {
    await pg.stop();
  } catch (error) {
    // On Windows, postgres.exe can hold its data-directory file handles open for a moment after
    // the process itself has exited, so embedded-postgres's own post-stop `fs.rm` occasionally
    // loses this race (EBUSY). The server has already stopped correctly by this point either way
    // — this only affects whether the throwaway temp directory gets deleted immediately or is
    // left for the OS to reclaim later — so one retry is enough; a leftover temp dir is harmless.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("EBUSY")) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fs.promises.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
