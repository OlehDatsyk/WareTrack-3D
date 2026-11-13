import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { publicRoute, clientIp } from "@/server/api/handler";
import { authenticate, createSession } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/cookies";
import { rateLimit } from "@/server/auth/rate-limit";
import { AppError } from "@/server/errors";
import { loginSchema } from "@/schemas/auth";
import { audit } from "@/server/audit";

export const POST = publicRoute(async (req) => {
  const ip = clientIp(req);
  const input = loginSchema.parse(await req.json().catch(() => ({})));
  if (!rateLimit(`login:${ip ?? "local"}:${input.email.toLowerCase()}`, 8, 60_000)) {
    throw new AppError(429, "RATE_LIMITED", "Too many sign-in attempts. Please wait a minute and try again.");
  }
  let user;
  try {
    user = await authenticate(db, input.email, input.password);
  } catch (err) {
    await audit(db, { action: "auth.login_failed", entityType: "User", details: { email: input.email.toLowerCase() }, ip });
    throw err;
  }
  const { token, expiresAt } = await createSession(db, user.id, req.headers.get("user-agent"));
  await audit(db, { userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip });
  const res = NextResponse.json({ data: { user } });
  setSessionCookie(res, token, expiresAt);
  return res;
});
