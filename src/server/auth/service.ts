import type { Db } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";
import { AppError, conflict, unauthorized } from "@/server/errors";
import { hashPassword, verifyPassword } from "./password";
import { generateSessionToken, hashToken, sessionTtlMs } from "./tokens";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  defaultWarehouseId: string | null;
  preferences: Record<string, unknown>;
};

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  title: true,
  defaultWarehouseId: true,
  preferences: true,
  isActive: true,
} as const;

function toSessionUser(u: {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  defaultWarehouseId: string | null;
  preferences: unknown;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    defaultWarehouseId: u.defaultWarehouseId,
    preferences: (u.preferences ?? {}) as Record<string, unknown>,
  };
}

// Equalises timing between "unknown email" and "wrong password".
const DUMMY_HASH = "$2b$12$IK0F2PdAmRXEaELOiaNeku8L85Fisdxoyt4euPepo96O55OS8EWCC";

export async function authenticate(db: Db, email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { ...userSelect, passwordHash: true },
  });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized("Invalid email or password");
  if (!user.isActive) throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  return toSessionUser(user);
}

export async function registerUser(db: Db, input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict("An account with this email already exists");
  const firstWarehouse = await db.warehouse.findFirst({ orderBy: { code: "asc" }, select: { id: true } });
  // Self-registered accounts are read-only until an administrator grants a higher role.
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: "VIEWER",
      defaultWarehouseId: firstWarehouse?.id ?? null,
    },
    select: userSelect,
  });
  return toSessionUser(user);
}

export async function createSession(db: Db, userId: string, userAgent?: string | null) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 255) },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

export async function validateSession(db: Db, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: userSelect } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toSessionUser(session.user);
}

export async function destroySession(db: Db, token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function changePassword(db: Db, userId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new AppError(400, "INVALID_PASSWORD", "Current password is incorrect");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
}
