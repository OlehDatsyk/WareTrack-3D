import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import { createSession } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/tokens";
import { resetRateLimits } from "@/server/auth/rate-limit";

export const TEST_PASSWORD = "TestPassword#2026";

/** Wipes and reseeds the test database with a short metric history (fast). */
export async function resetDatabase() {
  resetRateLimits();
  await seedDatabase(db, { password: TEST_PASSWORD, historyDays: 20 });
}

export async function mainWarehouse() {
  return db.warehouse.findFirstOrThrow({ where: { code: "WH-01" } });
}

export async function sessionFor(role: "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER") {
  const user = await db.user.findFirstOrThrow({ where: { role } });
  const { token } = await createSession(db, user.id, "vitest");
  return { user, token };
}

type ReqInit = { method?: string; body?: unknown; token?: string; warehouseId?: string; headers?: Record<string, string> };

export function makeRequest(path: string, init: ReqInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("cookie", `${SESSION_COOKIE}=${init.token}`);
  if (init.warehouseId) headers.set("x-warehouse-id", init.warehouseId);
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

type Handler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

/** Invokes a route handler like Next.js would and returns status + parsed JSON. */
export async function call<P = Record<string, string>>(handler: Handler<P>, path: string, init: ReqInit = {}, params?: P) {
  const res = await handler(makeRequest(path, init), { params: Promise.resolve((params ?? {}) as P) });
  const text = await res.text();
  let json: { data?: unknown; error?: { code: string; message: string } } = {};
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON (e.g. CSV)
  }
  return { status: res.status, json, text, headers: res.headers };
}

export const actor = (userId: string) => ({ userId, name: "Test User", ip: null, simulated: false });
