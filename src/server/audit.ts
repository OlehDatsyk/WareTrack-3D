import type { Db, Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

type Client = Db | Tx;

export async function audit(
  client: Client,
  entry: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
    ip?: string | null;
  },
) {
  await client.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details ?? {},
      ip: entry.ip ?? null,
    },
  });
}

export async function logActivity(
  client: Client,
  entry: {
    warehouseId: string;
    type: string;
    message: string;
    entityType?: string;
    entityId?: string;
    actorName?: string | null;
    simulated?: boolean;
  },
) {
  await client.activityEvent.create({
    data: {
      warehouseId: entry.warehouseId,
      type: entry.type,
      message: entry.message,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorName: entry.actorName ?? null,
      simulated: entry.simulated ?? false,
    },
  });
}

/** Creates a notification, ignoring duplicates for the same dedupe key. */
export async function notify(
  client: Client,
  n: {
    warehouseId: string;
    category: Prisma.NotificationCreateManyInput["category"];
    priority?: Prisma.NotificationCreateManyInput["priority"];
    title: string;
    message: string;
    link?: string;
    entityType?: string;
    entityId?: string;
    dedupeKey?: string;
    simulated?: boolean;
  },
) {
  await client.notification.createMany({ data: [n], skipDuplicates: true });
}
