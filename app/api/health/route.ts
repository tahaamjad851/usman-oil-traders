import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isRedisConfigured, redis } from "@/lib/redis";

// Public, unauthenticated — pinged by external uptime monitoring (Phase 15). Reports DB
// connectivity always; Redis only when REDIS_URL is actually configured, since its absence is a
// deliberate launch-time gap (see lib/redis.ts) rather than a fault to report on.
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
    healthy = false;
  }

  if (isRedisConfigured()) {
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
      healthy = false;
    }
  }

  return NextResponse.json(
    { status: healthy ? "ok" : "error", checks },
    { status: healthy ? 200 : 503 },
  );
}
