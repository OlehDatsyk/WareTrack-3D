import { NextResponse, connection } from "next/server";
import { db } from "@/server/db";
import { checkHealth } from "@/server/services/health";

/** Liveness + database readiness probe used by Render. Always evaluated per request. */
export async function GET() {
  await connection();
  const result = await checkHealth(db);
  return NextResponse.json(result.body, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
