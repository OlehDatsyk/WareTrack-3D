import type { Db } from "@/server/db";

export async function checkHealth(db: Db) {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true as const, body: { status: "ok", database: "up", latencyMs: Date.now() - started, time: new Date().toISOString() } };
  } catch {
    return { ok: false as const, body: { status: "degraded", database: "down" } };
  }
}
