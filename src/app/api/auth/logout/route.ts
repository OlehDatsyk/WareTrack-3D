import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { publicRoute } from "@/server/api/handler";
import { destroySession } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/cookies";
import { SESSION_COOKIE } from "@/server/auth/tokens";

export const POST = publicRoute(async (req) => {
  await destroySession(db, req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ data: { ok: true } });
  clearSessionCookie(res);
  return res;
});
