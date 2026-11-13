import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { VehicleStatus, VehicleType } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import type { SiteLayout } from "@/lib/layout/geometry";
import { startTask, type Actor } from "./operations";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

const LIFTS: VehicleType[] = ["FORKLIFT", "REACH_TRUCK", "PALLET_JACK"];

export async function listVehicles(
  db: Db,
  warehouseId: string,
  f: { type?: VehicleType; group?: "lifts" | "road"; status?: VehicleStatus; q?: string; page: number; pageSize: number },
) {
  const where: Prisma.VehicleWhereInput = {
    warehouseId,
    ...(f.type ? { type: f.type } : f.group === "lifts" ? { type: { in: LIFTS } } : f.group === "road" ? { type: { in: ["TRUCK", "VAN"] } } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q
      ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { model: { contains: f.q, mode: "insensitive" } }, { registration: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total, summary] = await Promise.all([
    db.vehicle.findMany({
      where,
      include: {
        operator: { select: { id: true, firstName: true, lastName: true } },
        tasks: { where: { status: "IN_PROGRESS" }, select: { id: true, number: true, description: true, progress: true }, take: 1 },
        shipments: { where: { status: { in: ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"] } }, select: { id: true, trackingNumber: true, status: true, destination: true }, take: 1 },
      },
      orderBy: { code: "asc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.vehicle.count({ where }),
    db.vehicle.groupBy({ by: ["status"], where: { warehouseId }, _count: { _all: true } }),
  ]);
  return { items, total, summary: Object.fromEntries(summary.map((s) => [s.status, s._count._all])) as Record<string, number> };
}

export async function getVehicle(db: Db, warehouseId: string, id: string) {
  const v = await db.vehicle.findFirst({
    where: { id, warehouseId },
    include: {
      operator: { select: { id: true, firstName: true, lastName: true, role: true, status: true } },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, number: true, type: true, status: true, description: true, progress: true, startedAt: true, completedAt: true, simulated: true },
      },
      shipments: {
        orderBy: { scheduledAt: "desc" },
        take: 5,
        select: { id: true, trackingNumber: true, status: true, destination: true, eta: true, direction: true },
      },
      maintenance: { orderBy: { performedAt: "desc" }, take: 10 },
    },
  });
  if (!v) throw notFound("Vehicle");
  return v;
}

async function ensureOperator(db: Db, warehouseId: string, operatorId: string | null | undefined, vehicleId?: string) {
  if (!operatorId) return;
  const emp = await db.employee.findFirst({ where: { id: operatorId, warehouseId }, include: { vehicle: { select: { id: true, code: true } } } });
  if (!emp) throw badRequest("Operator not found in this warehouse");
  if (emp.vehicle && emp.vehicle.id !== vehicleId) throw conflict(`${emp.firstName} ${emp.lastName} is already assigned to ${emp.vehicle.code}`);
}

export async function createVehicle(db: Db, warehouseId: string, input: Omit<Prisma.VehicleUncheckedCreateInput, "warehouseId">, actor: UserActor) {
  await ensureOperator(db, warehouseId, input.operatorId);
  const wh = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { settings: true } });
  const layout = (wh.settings as { layout?: SiteLayout }).layout;
  const lift = LIFTS.includes(input.type as VehicleType);
  const count = await db.vehicle.count({ where: { warehouseId, type: lift ? { in: LIFTS } : { in: ["TRUCK", "VAN"] } } });
  const spots = lift ? layout?.chargeSpots : layout?.truckParking;
  const spot = spots?.[count % (spots.length || 1)];
  const v = await db.vehicle.create({
    data: {
      ...input,
      warehouseId,
      status: "AVAILABLE",
      locationLabel: lift ? "Charging bay" : "Truck parking",
      posX: spot?.x ?? 0,
      posZ: spot?.z ?? 0,
      heading: spot?.heading ?? 0,
      carrier: lift ? null : (input.carrier ?? "WareTrack Freight"),
    },
  });
  await audit(db, { userId: actor.userId, action: "vehicle.create", entityType: "Vehicle", entityId: v.id, details: { code: v.code, type: v.type }, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "vehicle.created", message: `${v.code} (${v.model}) added to the fleet`, entityType: "Vehicle", entityId: v.id, actorName: actor.name });
  return v;
}

export async function updateVehicle(db: Db, warehouseId: string, id: string, input: Prisma.VehicleUncheckedUpdateInput, actor: UserActor) {
  const v = await db.vehicle.findFirst({ where: { id, warehouseId }, include: { tasks: { where: { status: "IN_PROGRESS" } } } });
  if (!v) throw notFound("Vehicle");
  await ensureOperator(db, warehouseId, input.operatorId as string | null | undefined, id);
  if (input.status && input.status !== v.status && v.tasks.length && input.status !== "IN_USE") {
    throw conflict(`${v.code} is executing ${v.tasks[0]!.number}. Complete or cancel it first.`);
  }
  if (input.status === "IN_USE" && v.status !== "IN_USE") throw badRequest("Vehicles become 'in use' by being assigned a task or shipment");
  const data: Prisma.VehicleUncheckedUpdateInput = { ...input };
  if (input.status === "MAINTENANCE") data.locationLabel = "Maintenance bay";
  if (input.status === "CHARGING") data.locationLabel = "Charging bay";
  const updated = await db.vehicle.update({ where: { id }, data });
  await audit(db, { userId: actor.userId, action: "vehicle.update", entityType: "Vehicle", entityId: id, details: input as Prisma.InputJsonValue, ip: actor.ip });
  if (input.status && input.status !== v.status) {
    await logActivity(db, { warehouseId, type: "vehicle.status", message: `${v.code} set to ${String(input.status).toLowerCase().replace(/_/g, " ")}`, entityType: "Vehicle", entityId: id, actorName: actor.name });
  }
  return updated;
}

export async function deleteVehicle(db: Db, warehouseId: string, id: string, actor: UserActor) {
  const v = await db.vehicle.findFirst({
    where: { id, warehouseId },
    include: { _count: { select: { tasks: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }, shipments: { where: { status: { notIn: ["DELIVERED", "CANCELLED"] } } } } } },
  });
  if (!v) throw notFound("Vehicle");
  if (v._count.tasks || v._count.shipments) throw conflict(`${v.code} has open tasks or shipments`);
  await db.vehicle.delete({ where: { id } });
  await audit(db, { userId: actor.userId, action: "vehicle.delete", entityType: "Vehicle", entityId: id, details: { code: v.code }, ip: actor.ip });
  return { id };
}

/** Starts a pending task using this forklift. */
export async function assignTaskToVehicle(db: Db, warehouseId: string, vehicleId: string, taskId: string, actor: UserActor) {
  return db.$transaction(async (tx) => {
    const v = await tx.vehicle.findFirst({ where: { id: vehicleId, warehouseId } });
    if (!v) throw notFound("Vehicle");
    const task = await tx.task.findFirst({ where: { id: taskId, warehouseId } });
    if (!task) throw notFound("Task");
    const started = await startTask(tx, taskId, { vehicleId }, actor);
    await audit(tx, { userId: actor.userId, action: "vehicle.assign_task", entityType: "Vehicle", entityId: vehicleId, details: { task: task.number }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "task.started", message: `${task.number} assigned to ${v.code}`, entityType: "Task", entityId: task.id, actorName: actor.name });
    return started;
  });
}

export async function sendToCharge(db: Db, warehouseId: string, vehicleId: string, actor: UserActor) {
  const v = await db.vehicle.findFirst({ where: { id: vehicleId, warehouseId } });
  if (!v) throw notFound("Vehicle");
  if (!LIFTS.includes(v.type) || v.energyType !== "ELECTRIC") throw badRequest(`${v.code} is not a battery vehicle`);
  if (v.status !== "AVAILABLE") throw conflict(`${v.code} is ${v.status.toLowerCase().replace(/_/g, " ")}`);
  const wh = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { settings: true } });
  const spots = (wh.settings as { layout?: SiteLayout }).layout?.chargeSpots ?? [];
  const lifts = await db.vehicle.findMany({ where: { warehouseId, type: { in: LIFTS } }, orderBy: { code: "asc" }, select: { id: true } });
  const idx = lifts.findIndex((l) => l.id === v.id);
  const spot = spots[Math.max(0, idx) % Math.max(1, spots.length)];
  const updated = await db.vehicle.update({
    where: { id: vehicleId },
    data: { status: "CHARGING", locationLabel: "Charging bay", ...(spot ? { posX: spot.x, posZ: spot.z, heading: spot.heading } : {}) },
  });
  await audit(db, { userId: actor.userId, action: "vehicle.charge", entityType: "Vehicle", entityId: vehicleId, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "vehicle.status", message: `${v.code} sent to charge (${v.energyLevel}%)`, entityType: "Vehicle", entityId: vehicleId, actorName: actor.name });
  return updated;
}

export async function addMaintenance(
  db: Db,
  warehouseId: string,
  vehicleId: string,
  input: { type: string; description: string; cost: number; status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED"; performedBy?: string | null; performedAt?: Date },
  actor: UserActor,
) {
  const v = await db.vehicle.findFirst({ where: { id: vehicleId, warehouseId }, include: { tasks: { where: { status: "IN_PROGRESS" } } } });
  if (!v) throw notFound("Vehicle");
  if (input.status === "IN_PROGRESS" && v.tasks.length) throw conflict(`${v.code} is executing a task`);
  return db.$transaction(async (tx) => {
    const rec = await tx.maintenanceRecord.create({ data: { ...input, vehicleId, performedAt: input.performedAt ?? new Date() } });
    if (input.status === "IN_PROGRESS") {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "MAINTENANCE", locationLabel: "Maintenance bay" } });
    } else if (input.status === "COMPLETED") {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          lastServiceAt: rec.performedAt,
          nextServiceDue: new Date(rec.performedAt.getTime() + 60 * 86_400_000),
          ...(v.status === "MAINTENANCE" ? { status: "AVAILABLE", locationLabel: "Idle" } : {}),
        },
      });
      await tx.maintenanceRecord.updateMany({ where: { vehicleId, status: "IN_PROGRESS" }, data: { status: "COMPLETED" } });
    }
    await audit(tx, { userId: actor.userId, action: "vehicle.maintenance", entityType: "Vehicle", entityId: vehicleId, details: { type: input.type, status: input.status }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "vehicle.maintenance", message: `${v.code}: ${input.type} (${input.status.toLowerCase().replace("_", " ")})`, entityType: "Vehicle", entityId: vehicleId, actorName: actor.name });
    return rec;
  });
}
