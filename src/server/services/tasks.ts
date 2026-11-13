import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskStatus, TaskType } from "@/generated/prisma/enums";
import { notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import { cancelTask, completeTask, createTask, startTask, type Actor, type CreateTaskInput } from "./operations";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

const taskInclude = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, code: true } },
  pallet: { select: { id: true, code: true } },
  fromLocation: { select: { code: true } },
  toLocation: { select: { code: true } },
  order: { select: { id: true, number: true } },
  shipment: { select: { id: true, trackingNumber: true } },
} satisfies Prisma.TaskInclude;

export async function listTasks(
  db: Db,
  warehouseId: string,
  f: { status?: TaskStatus | "OPEN"; type?: TaskType; vehicleId?: string; assigneeId?: string; page: number; pageSize: number },
) {
  const where: Prisma.TaskWhereInput = {
    warehouseId,
    ...(f.status === "OPEN" ? { status: { in: ["PENDING", "IN_PROGRESS"] } } : f.status ? { status: f.status } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}),
    ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
  };
  const [items, total] = await Promise.all([
    db.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.task.count({ where }),
  ]);
  return { items, total };
}

export async function createManualTask(db: Db, warehouseId: string, input: Omit<CreateTaskInput, "warehouseId">, actor: UserActor) {
  return db.$transaction(async (tx) => {
    let fromLocationId: string | null = null;
    if (input.palletId) {
      const p = await tx.pallet.findFirst({ where: { id: input.palletId, warehouseId }, select: { locationId: true } });
      if (!p) throw notFound("Pallet");
      fromLocationId = p.locationId;
    }
    const task = await createTask(tx, { ...input, warehouseId, fromLocationId }, actor);
    await audit(tx, { userId: actor.userId, action: "task.create", entityType: "Task", entityId: task.id, details: { type: task.type }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "task.created", message: `${task.number} created: ${task.description}`, entityType: "Task", entityId: task.id, actorName: actor.name });
    return task;
  });
}

async function ensureTask(db: Db, warehouseId: string, id: string) {
  const t = await db.task.findFirst({ where: { id, warehouseId }, select: { id: true, number: true } });
  if (!t) throw notFound("Task");
  return t;
}

export async function startTaskAction(db: Db, warehouseId: string, id: string, opts: { vehicleId?: string | null; assigneeId?: string | null }, actor: UserActor) {
  const t = await ensureTask(db, warehouseId, id);
  return db.$transaction(async (tx) => {
    const started = await startTask(tx, id, opts, actor);
    await audit(tx, { userId: actor.userId, action: "task.start", entityType: "Task", entityId: id, details: { vehicleId: started.vehicleId, assigneeId: started.assigneeId }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "task.started", message: `${t.number} started`, entityType: "Task", entityId: id, actorName: actor.name });
    return started;
  });
}

export async function completeTaskAction(db: Db, warehouseId: string, id: string, actor: UserActor) {
  await ensureTask(db, warehouseId, id);
  return db.$transaction(async (tx) => {
    const res = await completeTask(tx, id, actor);
    await audit(tx, { userId: actor.userId, action: "task.complete", entityType: "Task", entityId: id, details: { summary: res.summary }, ip: actor.ip });
    return res;
  });
}

export async function cancelTaskAction(db: Db, warehouseId: string, id: string, actor: UserActor) {
  await ensureTask(db, warehouseId, id);
  return db.$transaction(async (tx) => {
    const t = await cancelTask(tx, id, actor);
    await audit(tx, { userId: actor.userId, action: "task.cancel", entityType: "Task", entityId: id, ip: actor.ip });
    return t;
  });
}
