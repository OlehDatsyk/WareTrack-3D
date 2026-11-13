/**
 * Core warehouse operations shared by API routes and the simulation engine:
 * pallet moves, task lifecycle, picking and loading. All functions take a
 * transaction client so callers control atomicity.
 */
import type { Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Priority, TaskType, ZoneType } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { logActivity } from "@/server/audit";
import { consumeStock, palletStatusForZone, transferPalletStock } from "./stock";
import { rackAccessPoint } from "@/lib/layout/geometry";

export type Actor = { userId?: string | null; name?: string | null; simulated?: boolean };

const OPEN_TASK = { in: ["PENDING", "IN_PROGRESS"] as ("PENDING" | "IN_PROGRESS")[] };
const BLOCKED_ZONE_STATUS = ["MAINTENANCE", "CLOSED"] as const;
export const FORKLIFT_TASKS: TaskType[] = ["PUTAWAY", "TRANSFER", "REPLENISH", "LOAD", "UNLOAD"];
export const LOAD_PROGRESS_PER_PALLET = 17;

export async function nextNumber(tx: Tx, seq: "task" | "order" | "shipment" | "pallet") {
  const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${seq}_number_seq') AS n`);
  const n = Number(rows[0]!.n);
  return { task: `TSK-${n}`, order: `SO-${n}`, shipment: `SHP-${n}`, pallet: `PAL-${n}` }[seq];
}

/** Free = no pallet, not blocked, zone usable, and not the destination of an open task. */
export function freeLocationWhere(warehouseId: string): Prisma.StorageLocationWhereInput {
  return {
    warehouseId,
    isBlocked: false,
    pallet: { is: null },
    zone: { status: { notIn: [...BLOCKED_ZONE_STATUS] } },
    tasksTo: { none: { status: OPEN_TASK } },
  };
}

export async function findFreeLocation(
  tx: Tx,
  warehouseId: string,
  opts: { zoneTypes?: ZoneType[]; zoneId?: string; preferProductId?: string; types?: ("RACK" | "SHELF" | "FLOOR")[]; maxWeightAtLeast?: number },
) {
  const where: Prisma.StorageLocationWhereInput = {
    ...freeLocationWhere(warehouseId),
    ...(opts.zoneId ? { zoneId: opts.zoneId } : {}),
    ...(opts.zoneTypes ? { zone: { type: { in: opts.zoneTypes }, status: { notIn: [...BLOCKED_ZONE_STATUS] } } } : {}),
    ...(opts.types ? { type: { in: opts.types } } : {}),
    ...(opts.maxWeightAtLeast ? { maxWeightKg: { gte: opts.maxWeightAtLeast } } : {}),
  };
  if (opts.preferProductId) {
    // prefer a slot in a rack that already holds the same product (slotting by SKU)
    const sibling = await tx.pallet.findFirst({
      where: { warehouseId, productId: opts.preferProductId, location: { rackId: { not: null }, zone: { type: { in: opts.zoneTypes ?? ["STORAGE"] } } } },
      select: { location: { select: { rackId: true } } },
    });
    if (sibling?.location?.rackId) {
      const near = await tx.storageLocation.findFirst({
        where: { ...where, rackId: sibling.location.rackId },
        orderBy: [{ level: "asc" }, { column: "asc" }],
      });
      if (near) return near;
    }
  }
  return tx.storageLocation.findFirst({ where, orderBy: [{ level: "asc" }, { code: "asc" }] });
}

/** Moves a pallet immediately (used directly by "move now" and by completing tasks). */
export async function movePallet(
  tx: Tx,
  args: { warehouseId: string; palletId: string; toLocationId: string; actor: Actor; reference?: string; ignoreTaskId?: string },
) {
  const pallet = await tx.pallet.findFirst({
    where: { id: args.palletId, warehouseId: args.warehouseId },
    include: { location: { include: { zone: true } }, product: { select: { name: true, sku: true } } },
  });
  if (!pallet) throw notFound("Pallet");
  if (pallet.status === "LOADED") throw badRequest("Pallet has already been loaded onto a vehicle");
  const target = await tx.storageLocation.findFirst({
    where: { id: args.toLocationId, warehouseId: args.warehouseId },
    include: { zone: true, pallet: { select: { id: true } } },
  });
  if (!target) throw notFound("Target location");
  if (target.pallet && target.pallet.id !== pallet.id) throw conflict(`Location ${target.code} is already occupied`);
  if (target.isBlocked) throw badRequest(`Location ${target.code} is blocked`);
  if ((BLOCKED_ZONE_STATUS as readonly string[]).includes(target.zone.status)) {
    throw badRequest(`Zone ${target.zone.name} is ${target.zone.status.toLowerCase()} and cannot receive stock`);
  }
  if (pallet.grossWeightKg > target.maxWeightKg) {
    throw badRequest(`Pallet weighs ${pallet.grossWeightKg} kg; ${target.code} is rated for ${target.maxWeightKg} kg`);
  }
  const competing = await tx.task.findFirst({
    where: {
      status: OPEN_TASK,
      id: args.ignoreTaskId ? { not: args.ignoreTaskId } : undefined,
      OR: [{ palletId: pallet.id }, { toLocationId: target.id }],
    },
    select: { number: true },
  });
  if (competing) throw conflict(`Task ${competing.number} is already moving this pallet or targeting this location`);

  const fromZone = pallet.location?.zone ?? null;
  const damaged = pallet.status === "DAMAGED";
  await transferPalletStock(tx, {
    warehouseId: args.warehouseId,
    productId: pallet.productId,
    qty: pallet.quantity,
    damagedPallet: damaged,
    from: fromZone ? { id: fromZone.id, type: fromZone.type } : null,
    to: { id: target.zone.id, type: target.zone.type },
  });
  const updated = await tx.pallet.update({
    where: { id: pallet.id },
    data: { locationId: target.id, status: damaged ? "DAMAGED" : palletStatusForZone(target.zone.type) },
  });
  await tx.stockMovement.create({
    data: {
      warehouseId: args.warehouseId,
      productId: pallet.productId,
      palletId: pallet.id,
      type: !fromZone ? "RECEIPT" : fromZone.type === "RECEIVING" && target.zone.type === "STORAGE" ? "PUTAWAY" : "TRANSFER",
      quantity: pallet.quantity,
      fromZoneId: fromZone?.id ?? null,
      toZoneId: target.zone.id,
      reference: args.reference ?? pallet.code,
      userId: args.actor.userId ?? null,
      simulated: !!args.actor.simulated,
    },
  });
  return { pallet: updated, from: pallet.location?.code ?? null, to: target.code, productName: pallet.product.name };
}

export type CreateTaskInput = {
  warehouseId: string;
  type: TaskType;
  description: string;
  priority?: Priority;
  palletId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  orderId?: string | null;
  shipmentId?: string | null;
  vehicleId?: string | null;
  assigneeId?: string | null;
  dueAt?: Date | null;
};

export async function createTask(tx: Tx, input: CreateTaskInput, actor: Actor) {
  if (input.palletId) {
    const busy = await tx.task.findFirst({ where: { palletId: input.palletId, status: OPEN_TASK }, select: { number: true } });
    if (busy) throw conflict(`Pallet already has open task ${busy.number}`);
  }
  if (input.toLocationId) {
    const targeted = await tx.task.findFirst({ where: { toLocationId: input.toLocationId, status: OPEN_TASK }, select: { number: true } });
    if (targeted) throw conflict(`Destination already reserved by task ${targeted.number}`);
  }
  const number = await nextNumber(tx, "task");
  const task = await tx.task.create({
    data: {
      number,
      warehouseId: input.warehouseId,
      type: input.type,
      description: input.description,
      priority: input.priority ?? "NORMAL",
      palletId: input.palletId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      orderId: input.orderId ?? null,
      shipmentId: input.shipmentId ?? null,
      vehicleId: input.vehicleId ?? null,
      assigneeId: input.assigneeId ?? null,
      dueAt: input.dueAt ?? null,
      simulated: !!actor.simulated,
    },
  });
  return task;
}

/** Assigns resources and starts a task. Picks an available forklift/operator when not given. */
export async function startTask(tx: Tx, taskId: string, opts: { vehicleId?: string | null; assigneeId?: string | null }, _actor: Actor) {
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task");
  if (task.status !== "PENDING") throw badRequest(`Task ${task.number} is ${task.status.toLowerCase().replace("_", " ")}`);
  const needsVehicle = FORKLIFT_TASKS.includes(task.type);
  let vehicleId = opts.vehicleId ?? task.vehicleId ?? null;
  let assigneeId = opts.assigneeId ?? task.assigneeId ?? null;

  if (needsVehicle) {
    const vehicle = vehicleId
      ? await tx.vehicle.findFirst({ where: { id: vehicleId, warehouseId: task.warehouseId } })
      : await tx.vehicle.findFirst({
          where: { warehouseId: task.warehouseId, type: { in: ["FORKLIFT", "REACH_TRUCK"] }, status: "AVAILABLE", energyLevel: { gte: 25 } },
          orderBy: { energyLevel: "desc" },
        });
    if (!vehicle) throw conflict("No forklift is available for this task");
    if (!["FORKLIFT", "REACH_TRUCK", "PALLET_JACK"].includes(vehicle.type)) throw badRequest(`${vehicle.code} cannot handle pallets`);
    if (vehicle.status !== "AVAILABLE") throw conflict(`${vehicle.code} is ${vehicle.status.toLowerCase().replace(/_/g, " ")}`);
    if (vehicle.energyLevel < 15) throw conflict(`${vehicle.code} battery is too low (${vehicle.energyLevel}%)`);
    vehicleId = vehicle.id;
    assigneeId = assigneeId ?? vehicle.operatorId;
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "IN_USE", locationLabel: `Task ${task.number}` } });
  }
  if (!assigneeId) {
    const role = task.type === "PICK" ? "PICKER" : task.type === "CYCLE_COUNT" ? "INVENTORY_CLERK" : "FORKLIFT_OPERATOR";
    const emp = await tx.employee.findFirst({
      where: { warehouseId: task.warehouseId, role, status: "ON_SHIFT", tasks: { none: { status: "IN_PROGRESS" } } },
      orderBy: { tasksCompleted: "asc" },
    });
    assigneeId = emp?.id ?? null;
  }
  if (task.palletId) await tx.pallet.update({ where: { id: task.palletId }, data: { status: "IN_TRANSIT" } }).catch(() => undefined);
  return tx.task.update({
    where: { id: task.id },
    data: { status: "IN_PROGRESS", vehicleId, assigneeId, startedAt: new Date(), progress: Math.max(task.progress, 1) },
  });
}

/** Completes a task and applies its effect on stock, orders and shipments. */
export async function completeTask(tx: Tx, taskId: string, actor: Actor) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: { vehicle: true, pallet: { include: { location: { include: { zone: true } } } }, toLocation: { include: { rack: true } }, order: { include: { items: true } }, shipment: { include: { dock: true } } },
  });
  if (!task) throw notFound("Task");
  if (task.status === "COMPLETED" || task.status === "CANCELLED") throw badRequest(`Task ${task.number} is already closed`);
  let summary = `${task.number} completed`;

  if ((task.type === "PUTAWAY" || task.type === "TRANSFER" || task.type === "REPLENISH" || task.type === "UNLOAD") && task.palletId && task.toLocationId) {
    const moved = await movePallet(tx, {
      warehouseId: task.warehouseId,
      palletId: task.palletId,
      toLocationId: task.toLocationId,
      actor,
      reference: task.number,
      ignoreTaskId: task.id,
    });
    summary = `${moved.pallet.code} ${task.type === "UNLOAD" ? "unloaded" : "moved"} ${moved.from ? `from ${moved.from} ` : ""}to ${moved.to}`;
    if (task.vehicle && task.toLocation) {
      // park the forklift in the aisle in front of the slot, facing it
      const loc = task.toLocation;
      const park = loc.rack
        ? { ...rackAccessPoint(loc.rack, loc.column), heading: loc.rack.aisleSide > 0 ? Math.PI : 0 }
        : { x: loc.posX - 1.9, z: loc.posZ, heading: Math.PI / 2 };
      await tx.vehicle.update({
        where: { id: task.vehicle.id },
        data: { posX: park.x, posZ: park.z, heading: park.heading },
      });
    }
  } else if (task.type === "LOAD" && task.palletId && task.shipment) {
    const p = task.pallet;
    if (p) {
      if (p.location?.zone) {
        await transferPalletStock(tx, {
          warehouseId: task.warehouseId,
          productId: p.productId,
          qty: p.quantity,
          damagedPallet: p.status === "DAMAGED",
          from: { id: p.location.zone.id, type: p.location.zone.type },
          to: null,
        });
      }
      await tx.pallet.update({ where: { id: p.id }, data: { status: "LOADED", locationId: null } });
      await tx.stockMovement.create({
        data: { warehouseId: task.warehouseId, productId: p.productId, palletId: p.id, type: "DISPATCH", quantity: -p.quantity, fromZoneId: p.location?.zoneId ?? null, reference: task.shipment.trackingNumber, userId: actor.userId ?? null, simulated: !!actor.simulated },
      });
      const sh = task.shipment;
      await tx.shipment.update({
        where: { id: sh.id },
        data: {
          palletCount: sh.palletCount + 1,
          weightKg: sh.weightKg + p.grossWeightKg,
          // each staged pallet represents roughly a sixth of a trailer load
          loadingProgress: Math.min(100, sh.loadingProgress + LOAD_PROGRESS_PER_PALLET),
        },
      });
      summary = `${p.code} loaded onto ${sh.trackingNumber}${sh.dock ? ` at ${sh.dock.name}` : ""}`;
    }
    if (task.vehicle && task.shipment.dock) {
      await tx.vehicle.update({ where: { id: task.vehicle.id }, data: { posX: task.shipment.dock.posX - 3.2, posZ: task.shipment.dock.posZ, heading: Math.PI / 2 } });
    }
  } else if (task.type === "PICK" && task.order) {
    let units = 0;
    for (const item of task.order.items) {
      const remaining = item.quantity - item.pickedQty;
      if (remaining <= 0) continue;
      const got = await consumeStock(tx, { warehouseId: task.warehouseId, productId: item.productId, qty: remaining, releaseReserved: true });
      units += got;
      await tx.orderItem.update({ where: { id: item.id }, data: { pickedQty: item.pickedQty + got } });
      await tx.stockMovement.create({
        data: { warehouseId: task.warehouseId, productId: item.productId, type: "PICK", quantity: -got, reference: task.order.number, userId: actor.userId ?? null, simulated: !!actor.simulated },
      });
    }
    if (task.order.status === "PICKING" || task.order.status === "PROCESSING") {
      await tx.order.update({ where: { id: task.order.id }, data: { status: "PACKING" } });
    }
    summary = `${task.order.number} picked (${units} units)`;
  }

  if (task.vehicle) {
    const drain = task.vehicle.type === "REACH_TRUCK" ? 2 : 1;
    await tx.vehicle.update({
      where: { id: task.vehicle.id },
      data: {
        status: "AVAILABLE",
        energyLevel: Math.max(0, task.vehicle.energyLevel - drain),
        locationLabel: "Idle",
        hoursUsed: task.vehicle.hoursUsed + 1,
      },
    });
  }
  if (task.assigneeId) {
    await tx.employee.update({ where: { id: task.assigneeId }, data: { tasksCompleted: { increment: 1 } } });
  }
  const done = await tx.task.update({
    where: { id: task.id },
    data: { status: "COMPLETED", progress: 100, completedAt: new Date() },
  });
  await logActivity(tx, {
    warehouseId: task.warehouseId,
    type: `task.${task.type.toLowerCase()}`,
    message: `${summary}${task.vehicle ? ` · ${task.vehicle.code}` : ""}`,
    entityType: "Task",
    entityId: task.id,
    actorName: actor.name ?? null,
    simulated: !!actor.simulated,
  });
  return { task: done, summary };
}

export async function cancelTask(tx: Tx, taskId: string, actor: Actor) {
  const task = await tx.task.findUnique({ where: { id: taskId }, include: { vehicle: true, pallet: { include: { location: { include: { zone: true } } } } } });
  if (!task) throw notFound("Task");
  if (task.status === "COMPLETED" || task.status === "CANCELLED") throw badRequest(`Task ${task.number} is already closed`);
  if (task.vehicle && task.vehicle.status === "IN_USE") {
    await tx.vehicle.update({ where: { id: task.vehicle.id }, data: { status: "AVAILABLE", locationLabel: "Idle" } });
  }
  if (task.pallet && task.pallet.status === "IN_TRANSIT") {
    const zoneType = task.pallet.location?.zone.type;
    await tx.pallet.update({ where: { id: task.pallet.id }, data: { status: zoneType ? palletStatusForZone(zoneType) : "RECEIVED" } });
  }
  const t = await tx.task.update({ where: { id: task.id }, data: { status: "CANCELLED", completedAt: new Date() } });
  await logActivity(tx, {
    warehouseId: task.warehouseId,
    type: "task.cancelled",
    message: `${task.number} cancelled`,
    entityType: "Task",
    entityId: task.id,
    actorName: actor.name ?? null,
    simulated: !!actor.simulated,
  });
  return t;
}
