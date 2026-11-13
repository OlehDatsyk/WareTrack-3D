import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationCategory, NotificationPriority } from "@/generated/prisma/enums";
import { notFound } from "@/server/errors";

export type NotificationFilter = {
  page: number;
  pageSize: number;
  status?: "all" | "unread" | "read";
  category?: NotificationCategory;
  priority?: NotificationPriority;
};

function mutedCategories(preferences: Record<string, unknown>): NotificationCategory[] {
  const n = preferences?.notifications as { muted?: unknown } | undefined;
  return Array.isArray(n?.muted) ? (n!.muted as NotificationCategory[]) : [];
}

function baseWhere(warehouseId: string, userId: string, preferences: Record<string, unknown>, f?: Partial<NotificationFilter>) {
  const where: Prisma.NotificationWhereInput = { warehouseId };
  const muted = mutedCategories(preferences);
  if (f?.category) where.category = f.category;
  else if (muted.length) where.category = { notIn: muted };
  if (f?.priority) where.priority = f.priority;
  if (f?.status === "unread") where.reads = { none: { userId } };
  if (f?.status === "read") where.reads = { some: { userId } };
  return where;
}

export async function listNotifications(
  db: Db,
  warehouseId: string,
  user: { id: string; preferences: Record<string, unknown> },
  f: NotificationFilter,
) {
  const where = baseWhere(warehouseId, user.id, user.preferences, f);
  const [items, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { reads: { where: { userId: user.id }, select: { readAt: true } } },
    }),
    db.notification.count({ where }),
  ]);
  return {
    total,
    items: items.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0, readAt: reads[0]?.readAt ?? null })),
  };
}

export async function countUnread(db: Db, warehouseId: string, user: { id: string; preferences: Record<string, unknown> }) {
  const unread = await db.notification.count({ where: baseWhere(warehouseId, user.id, user.preferences, { status: "unread" }) });
  const critical = await db.notification.count({
    where: { ...baseWhere(warehouseId, user.id, user.preferences, { status: "unread" }), priority: { in: ["HIGH", "CRITICAL"] } },
  });
  return { unread, critical };
}

export async function setRead(db: Db, warehouseId: string, userId: string, id: string, read: boolean) {
  const n = await db.notification.findFirst({ where: { id, warehouseId }, select: { id: true } });
  if (!n) throw notFound("Notification");
  if (read) {
    await db.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: {},
    });
  } else {
    await db.notificationRead.deleteMany({ where: { notificationId: id, userId } });
  }
  return { id, read };
}

export async function markAllRead(db: Db, warehouseId: string, userId: string) {
  const unread = await db.notification.findMany({
    where: { warehouseId, reads: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length) {
    await db.notificationRead.createMany({
      data: unread.map((n) => ({ notificationId: n.id, userId })),
      skipDuplicates: true,
    });
  }
  return { updated: unread.length };
}
