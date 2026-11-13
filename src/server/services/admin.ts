import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";

type UserActor = { userId: string; name: string; ip?: string | null };

export async function updateProfile(
  db: Db,
  userId: string,
  input: { name?: string; title?: string | null; defaultWarehouseId?: string | null; preferences?: Record<string, unknown> },
  actor: UserActor,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (input.defaultWarehouseId) {
    const wh = await db.warehouse.findUnique({ where: { id: input.defaultWarehouseId } });
    if (!wh) throw badRequest("Warehouse not found");
  }
  const preferences = input.preferences ? { ...(user.preferences as Record<string, unknown>), ...input.preferences } : undefined;
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      title: input.title,
      defaultWarehouseId: input.defaultWarehouseId,
      preferences: preferences as Prisma.InputJsonValue | undefined,
    },
    select: { id: true, name: true, title: true, email: true, role: true, defaultWarehouseId: true, preferences: true },
  });
  await audit(db, { userId: actor.userId, action: "user.profile", entityType: "User", entityId: userId, details: { fields: Object.keys(input) }, ip: actor.ip });
  return updated;
}

export async function getWarehouseSettings(db: Db, id: string) {
  const wh = await db.warehouse.findUnique({ where: { id }, include: { simulation: true } });
  if (!wh) throw notFound("Warehouse");
  const s = (wh.settings ?? {}) as { capacityWarningPct?: number; dockSlotMinutes?: number; operatingHours?: { open: string; close: string } };
  return {
    id: wh.id,
    code: wh.code,
    name: wh.name,
    address: wh.address,
    city: wh.city,
    timezone: wh.timezone,
    capacityWarningPct: s.capacityWarningPct ?? 90,
    dockSlotMinutes: s.dockSlotMinutes ?? 45,
    openTime: s.operatingHours?.open ?? "06:00",
    closeTime: s.operatingHours?.close ?? "22:00",
    simulationRunning: wh.simulation?.running ?? false,
    simulationIntervalSec: Math.round((wh.simulation?.intervalMs ?? 4000) / 1000),
    simulationTick: wh.simulation?.tick ?? 0,
  };
}

export async function updateWarehouseSettings(
  db: Db,
  id: string,
  input: { name: string; address: string; city: string; timezone: string; capacityWarningPct: number; dockSlotMinutes: number; openTime: string; closeTime: string; simulationRunning: boolean; simulationIntervalSec: number },
  actor: UserActor,
) {
  const wh = await db.warehouse.findUnique({ where: { id } });
  if (!wh) throw notFound("Warehouse");
  const settings = {
    ...(wh.settings as Record<string, unknown>),
    capacityWarningPct: input.capacityWarningPct,
    dockSlotMinutes: input.dockSlotMinutes,
    operatingHours: { open: input.openTime, close: input.closeTime },
  };
  await db.$transaction([
    db.warehouse.update({ where: { id }, data: { name: input.name, address: input.address, city: input.city, timezone: input.timezone, settings: settings as Prisma.InputJsonValue } }),
    db.simulationState.upsert({
      where: { warehouseId: id },
      create: { warehouseId: id, running: input.simulationRunning, intervalMs: input.simulationIntervalSec * 1000 },
      update: { running: input.simulationRunning, intervalMs: input.simulationIntervalSec * 1000 },
    }),
  ]);
  await audit(db, { userId: actor.userId, action: "warehouse.settings", entityType: "Warehouse", entityId: id, details: input as unknown as Prisma.InputJsonValue, ip: actor.ip });
  return getWarehouseSettings(db, id);
}

export async function listUsers(db: Db) {
  return db.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, title: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
}

export async function createUser(db: Db, input: { name: string; email: string; role: Role; title?: string | null; password: string }, actor: UserActor) {
  const email = input.email.toLowerCase().trim();
  if (await db.user.findUnique({ where: { email } })) throw conflict("A user with this email already exists");
  const firstWh = await db.warehouse.findFirst({ orderBy: { code: "asc" }, select: { id: true } });
  const user = await db.user.create({
    data: { name: input.name, email, role: input.role, title: input.title ?? null, passwordHash: await hashPassword(input.password), defaultWarehouseId: firstWh?.id },
    select: { id: true, name: true, email: true, role: true },
  });
  await audit(db, { userId: actor.userId, action: "user.create", entityType: "User", entityId: user.id, details: { email, role: input.role }, ip: actor.ip });
  return user;
}

export async function updateUser(db: Db, id: string, input: { role?: Role; isActive?: boolean; title?: string | null }, actor: UserActor) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw notFound("User");
  if (id === actor.userId && (input.role && input.role !== user.role)) throw badRequest("You cannot change your own role");
  if (id === actor.userId && input.isActive === false) throw badRequest("You cannot deactivate your own account");
  const losingAdmin = user.role === "ADMIN" && ((input.role && input.role !== "ADMIN") || input.isActive === false);
  if (losingAdmin) {
    const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) throw conflict("At least one active administrator is required");
  }
  const updated = await db.user.update({ where: { id }, data: input, select: { id: true, name: true, email: true, role: true, isActive: true, title: true } });
  if (input.isActive === false || (input.role && input.role !== user.role)) {
    // force re-authentication so new permissions apply immediately
    await db.session.deleteMany({ where: { userId: id } });
  }
  await audit(db, { userId: actor.userId, action: "user.update", entityType: "User", entityId: id, details: { ...input, previousRole: user.role }, ip: actor.ip });
  return updated;
}

export async function listAudit(db: Db, q: { page: number; pageSize: number; q?: string; entityType?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.q ? { OR: [{ action: { contains: q.q, mode: "insensitive" } }, { user: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.auditLog.count({ where }),
  ]);
  return { items, total };
}

export async function listActivity(db: Db, warehouseId: string, q: { page: number; pageSize: number; source: "all" | "simulated" | "manual"; type?: string }) {
  const where: Prisma.ActivityEventWhereInput = {
    warehouseId,
    ...(q.source === "simulated" ? { simulated: true } : q.source === "manual" ? { simulated: false } : {}),
    ...(q.type ? { type: { startsWith: q.type } } : {}),
  };
  const [items, total] = await Promise.all([
    db.activityEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.activityEvent.count({ where }),
  ]);
  return { items, total };
}
