import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import type { EmployeeQuery } from "@/schemas/workforce";
import { FORKLIFT_TASKS, startTask, type Actor } from "./operations";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

export async function listEmployees(db: Db, warehouseId: string, q: EmployeeQuery) {
  const where: Prisma.EmployeeWhereInput = {
    warehouseId,
    ...(q.role ? { role: q.role } : {}),
    ...(q.shift ? { shift: q.shift } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { firstName: { contains: q.q, mode: "insensitive" } },
            { lastName: { contains: q.q, mode: "insensitive" } },
            { employeeCode: { contains: q.q, mode: "insensitive" } },
            { email: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total, byStatus, byShift] = await Promise.all([
    db.employee.findMany({
      where,
      include: {
        zone: { select: { id: true, name: true } },
        vehicle: { select: { id: true, code: true } },
        tasks: { where: { status: "IN_PROGRESS" }, select: { id: true, number: true, description: true, progress: true }, take: 1 },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.employee.count({ where }),
    db.employee.groupBy({ by: ["status"], where: { warehouseId }, _count: { _all: true } }),
    db.employee.groupBy({ by: ["shift"], where: { warehouseId }, _count: { _all: true } }),
  ]);
  return {
    items,
    total,
    summary: {
      status: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>,
      shift: Object.fromEntries(byShift.map((s) => [s.shift, s._count._all])) as Record<string, number>,
    },
  };
}

export async function getEmployee(db: Db, warehouseId: string, id: string) {
  const e = await db.employee.findFirst({
    where: { id, warehouseId },
    include: {
      zone: { select: { id: true, name: true } },
      vehicle: { select: { id: true, code: true, model: true, status: true } },
      user: { select: { email: true, role: true } },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, number: true, type: true, status: true, description: true, progress: true, completedAt: true, startedAt: true, simulated: true },
      },
    },
  });
  if (!e) throw notFound("Employee");
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const completedWeek = await db.task.count({ where: { assigneeId: id, status: "COMPLETED", completedAt: { gte: weekAgo } } });
  return { ...e, completedWeek };
}

async function checkEmail(db: Db, email: string, exceptId?: string) {
  const dup = await db.employee.findFirst({ where: { email: email.toLowerCase(), ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw conflict("Another employee already uses this email");
}

export async function createEmployee(db: Db, warehouseId: string, input: Omit<Prisma.EmployeeUncheckedCreateInput, "warehouseId" | "employeeCode">, actor: UserActor) {
  await checkEmail(db, input.email);
  if (input.zoneId) {
    const z = await db.zone.findFirst({ where: { id: input.zoneId, warehouseId } });
    if (!z) throw badRequest("Zone not found in this warehouse");
  }
  const last = await db.employee.findFirst({ orderBy: { employeeCode: "desc" }, select: { employeeCode: true } });
  const n = Number(last?.employeeCode.replace(/\D/g, "") ?? 1000) + 1;
  const e = await db.employee.create({ data: { ...input, email: input.email.toLowerCase(), warehouseId, employeeCode: `EMP-${n}` } });
  await audit(db, { userId: actor.userId, action: "employee.create", entityType: "Employee", entityId: e.id, details: { code: e.employeeCode }, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "employee.created", message: `${e.firstName} ${e.lastName} joined as ${e.role.toLowerCase().replace(/_/g, " ")}`, entityType: "Employee", entityId: e.id, actorName: actor.name });
  return e;
}

export async function updateEmployee(db: Db, warehouseId: string, id: string, input: Prisma.EmployeeUncheckedUpdateInput, actor: UserActor) {
  const e = await db.employee.findFirst({ where: { id, warehouseId }, include: { tasks: { where: { status: "IN_PROGRESS" } } } });
  if (!e) throw notFound("Employee");
  if (typeof input.email === "string") await checkEmail(db, input.email, id);
  if ((input.status === "OFF_SHIFT" || input.status === "ON_LEAVE") && e.tasks.length) {
    throw conflict(`${e.firstName} is working on ${e.tasks[0]!.number}. Reassign or complete it first.`);
  }
  if (input.zoneId) {
    const z = await db.zone.findFirst({ where: { id: input.zoneId as string, warehouseId } });
    if (!z) throw badRequest("Zone not found in this warehouse");
  }
  const updated = await db.employee.update({ where: { id }, data: { ...input, ...(typeof input.email === "string" ? { email: input.email.toLowerCase() } : {}) } });
  await audit(db, { userId: actor.userId, action: "employee.update", entityType: "Employee", entityId: id, details: { fields: Object.keys(input) }, ip: actor.ip });
  if (input.status && input.status !== e.status) {
    await logActivity(db, { warehouseId, type: "employee.status", message: `${e.firstName} ${e.lastName} is now ${String(input.status).toLowerCase().replace(/_/g, " ")}`, entityType: "Employee", entityId: id, actorName: actor.name });
  }
  return updated;
}

export async function deleteEmployee(db: Db, warehouseId: string, id: string, actor: UserActor) {
  const e = await db.employee.findFirst({ where: { id, warehouseId }, include: { tasks: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } } } } });
  if (!e) throw notFound("Employee");
  if (e.tasks.length) throw conflict("This employee has open tasks. Reassign them first.");
  await db.$transaction([
    db.vehicle.updateMany({ where: { operatorId: id }, data: { operatorId: null } }),
    db.employee.delete({ where: { id } }),
  ]);
  await audit(db, { userId: actor.userId, action: "employee.delete", entityType: "Employee", entityId: id, details: { code: e.employeeCode, name: `${e.firstName} ${e.lastName}` }, ip: actor.ip });
  return { id };
}

/** Assigns an employee to a pending task and starts it. */
export async function assignEmployeeToTask(db: Db, warehouseId: string, employeeId: string, taskId: string, actor: UserActor) {
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findFirst({ where: { id: employeeId, warehouseId }, include: { vehicle: true, tasks: { where: { status: "IN_PROGRESS" } } } });
    if (!e) throw notFound("Employee");
    if (e.status !== "ON_SHIFT") throw conflict(`${e.firstName} is not on shift`);
    if (e.tasks.length) throw conflict(`${e.firstName} is already working on ${e.tasks[0]!.number}`);
    const task = await tx.task.findFirst({ where: { id: taskId, warehouseId } });
    if (!task) throw notFound("Task");
    const needsLift = FORKLIFT_TASKS.includes(task.type);
    if (needsLift && e.role !== "FORKLIFT_OPERATOR" && e.role !== "SUPERVISOR") throw badRequest(`${task.number} needs a certified forklift operator`);
    const started = await startTask(tx, taskId, { assigneeId: e.id, vehicleId: needsLift ? (e.vehicle?.status === "AVAILABLE" ? e.vehicle.id : null) : null }, actor);
    await audit(tx, { userId: actor.userId, action: "employee.assign_task", entityType: "Employee", entityId: e.id, details: { task: task.number }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "task.started", message: `${task.number} assigned to ${e.firstName} ${e.lastName}`, entityType: "Task", entityId: task.id, actorName: actor.name });
    return started;
  });
}
