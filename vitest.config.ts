import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // More specific aliases must come before the general "@" prefix alias below — Vite's alias
      // resolution checks entries in order and uses the first prefix match, so "@/auth" would
      // never be reached if "@" (which also prefix-matches "@/auth") were listed first.
      "@/auth": path.resolve(__dirname, "tests/stubs/auth.ts"),
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Placeholders only — every test injects its own dependencies (see the DI
      // parameters throughout lib/services/*), so the real Prisma/Redis clients are
      // constructed (lazily) but never actually queried. These just satisfy the
      // "must be configured" checks in lib/db.ts and lib/redis.ts at import time.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
