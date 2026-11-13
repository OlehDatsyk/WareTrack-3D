import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { publicRoute, clientIp } from "@/server/api/handler";
import { createSession, registerUser } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/cookies";
import { rateLimit } from "@/server/auth/rate-limit";
import { AppError } from "@/server/errors";
import { registerSchema } from "@/schemas/auth";
import { audit } from "@/server/audit";

export const POST = publicRoute(async (req) => {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip ?? "local"}`, 5, 10 * 60_000)) {
    throw new AppError(429, "RATE_LIMITED", "Too many registrations from this address. Try again later.");
  }
  const input = registerSchema.parse(await req.json().catch(() => ({})));
  const user = await registerUser(db, input);
  const { token, expiresAt } = await createSession(db, user.id, req.headers.get("user-agent"));
  await audit(db, { userId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ip });
  const res = NextResponse.json({ data: { user } }, { status: 201 });
  setSessionCookie(res, token, expiresAt);
  return res;
});
