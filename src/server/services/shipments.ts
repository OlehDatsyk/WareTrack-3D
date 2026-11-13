import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ShipmentStatus } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import { canTransitionShipment } from "@/lib/workflows";
import type { ShipmentQuery } from "@/schemas/shipments";
import { CITY_MAP } from "@/server/seed/catalog";
import { nextNumber, type Actor } from "./operations";
import type { SiteLayout } from "@/lib/layout/geometry";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };
const ACTIVE: ShipmentStatus[] = ["PLANNED", "AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"];

export async function listShipments(db: Db, warehouseId: string, q: ShipmentQuery) {
  const where: Prisma.ShipmentWhereInput = {
    warehouseId,
    ...(q.direction ? { direction: q.direction } : {}),
    ...(q.status ? { status: q.status } : q.active ? { status: { in: ACTIVE } } : {}),
    ...(q.q
      ? {
          OR: [
            { trackingNumber: { contains: q.q, mode: "insensitive" } },
            { destination: { contains: q.q, mode: "insensitive" } },
            { origin: { contains: q.q, mode: "insensitive" } },
            { carrier: { contains: q.q, mode: "insensitive" } },
            { vehicle: { code: { contains: q.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total, counts] = await Promise.all([
    db.shipment.findMany({
      where,
      include: {
        vehicle: { select: { id: true, code: true } },
        driver: { select: { firstName: true, lastName: true } },
        dock: { select: { name: true } },
        _count: { select: { orders: true } },
      },
      orderBy: [{ scheduledAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.shipment.count({ where }),
    db.shipment.groupBy({ by: ["status"], where: { warehouseId, ...(q.direction ? { direction: q.direction } : {}) }, _count: { _all: true } }),
  ]);
  return { items, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number> };
}

/** In-transit vehicles for the schematic route map (simulated positions, not GPS). */
export async function routeMap(db: Db, warehouseId: string) {
  const wh = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { city: true, name: true } });
  const moving = await db.shipment.findMany({
    where: { warehouseId, status: { in: ["IN_TRANSIT", "DELAYED"] } },
    include: { vehicle: { select: { code: true } } },
  });
  return {
    origin: { name: wh.name, city: wh.city, ...(CITY_MAP[wh.city] ?? { x: 0.5, y: 0.5 }) },
    routes: moving.map((s) => ({
      id: s.id,
      trackingNumber: s.trackingNumber,
      direction: s.direction,
      status: s.status,
      label: s.vehicle?.code ?? s.carrier,
      city: s.direction === "OUTBOUND" ? s.destination : s.origin,
      x: s.destMapX,
      y: s.destMapY,
      progress: s.routeProgress,
      eta: s.eta,
    })),
  };
}

export async function getShipment(db: Db, warehouseId: string, id: string) {
  const s = await db.shipment.findFirst({
    where: { id, warehouseId },
    include: {
      vehicle: { select: { id: true, code: true, model: true, registration: true, type: true } },
      driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
      dock: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
      orders: { include: { customer: { select: { name: true } }, _count: { select: { items: true } } } },
      tasks: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, select: { id: true, number: true, type: true, status: true, progress: true } },
    },
  });
  if (!s) throw notFound("Shipment");
  const wh = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { city: true } });
  return { ...s, originMap: CITY_MAP[wh.city] ?? { x: 0.5, y: 0.5 } };
}

export async function createShipment(
  db: Db,
  warehouseId: string,
  input: { direction: "INBOUND" | "OUTBOUND"; carrier: string; counterpart: string; scheduledAt: Date; eta: Date; palletCount: number; weightKg: number; vehicleId?: string | null; driverId?: string | null; orderIds: string[] },
  actor: UserActor,
) {
  const wh = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { city: true } });
  if (input.vehicleId) {
    const v = await db.vehicle.findFirst({ where: { id: input.vehicleId, warehouseId } });
    if (!v || (v.type !== "TRUCK" && v.type !== "VAN")) throw badRequest("Choose a truck or van");
  }
  if (input.driverId) {
    const d = await db.employee.findFirst({ where: { id: input.driverId, warehouseId, role: "DRIVER" } });
    if (!d) throw badRequest("Choose a driver from this warehouse");
  }
  if (input.orderIds.length) {
    if (input.direction !== "OUTBOUND") throw badRequest("Only outbound shipments carry customer orders");
    const n = await db.order.count({ where: { id: { in: input.orderIds }, warehouseId, status: { notIn: ["DISPATCHED", "DELIVERED", "CANCELLED"] } } });
    if (n !== input.orderIds.length) throw badRequest("Some orders cannot be added (already dispatched or cancelled)");
  }
  const map = CITY_MAP[input.counterpart] ?? { x: 0.3 + ((input.counterpart.length * 37) % 50) / 100, y: 0.3 + ((input.counterpart.length * 53) % 50) / 100 };
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.create({
      data: {
        trackingNumber: await nextNumber(tx, "shipment"),
        warehouseId,
        direction: input.direction,
        carrier: input.carrier,
        origin: input.direction === "OUTBOUND" ? wh.city : input.counterpart,
        destination: input.direction === "OUTBOUND" ? input.counterpart : wh.city,
        destMapX: map.x,
        destMapY: map.y,
        scheduledAt: input.scheduledAt,
        eta: input.eta,
        palletCount: input.palletCount,
        weightKg: input.weightKg,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
      },
    });
    if (input.orderIds.length) await tx.order.updateMany({ where: { id: { in: input.orderIds } }, data: { shipmentId: s.id } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "PLANNED", message: `Shipment planned by ${actor.name}`, location: s.origin } });
    await audit(tx, { userId: actor.userId, action: "shipment.create", entityType: "Shipment", entityId: s.id, details: { trackingNumber: s.trackingNumber }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "shipment.created", message: `${s.trackingNumber} planned (${input.direction.toLowerCase()}, ${input.counterpart})`, entityType: "Shipment", entityId: s.id, actorName: actor.name });
    return s;
  });
}

export async function assignShipmentResources(db: Db, warehouseId: string, id: string, input: { vehicleId?: string | null; driverId?: string | null }, actor: UserActor) {
  const s = await db.shipment.findFirst({ where: { id, warehouseId } });
  if (!s) throw notFound("Shipment");
  if (["IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED"].includes(s.status)) throw badRequest("Resources can only change before departure");
  const data: Prisma.ShipmentUncheckedUpdateInput = {};
  if (input.vehicleId !== undefined) {
    if (input.vehicleId) {
      const v = await db.vehicle.findFirst({ where: { id: input.vehicleId, warehouseId } });
      if (!v || (v.type !== "TRUCK" && v.type !== "VAN")) throw badRequest("Choose a truck or van");
      if (v.status === "MAINTENANCE" || v.status === "OUT_OF_SERVICE") throw conflict(`${v.code} is unavailable`);
      const busy = await db.shipment.findFirst({ where: { vehicleId: v.id, id: { not: id }, status: { in: ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"] } } });
      if (busy) throw conflict(`${v.code} is already on shipment ${busy.trackingNumber}`);
    }
    data.vehicleId = input.vehicleId;
  }
  if (input.driverId !== undefined) {
    if (input.driverId) {
      const d = await db.employee.findFirst({ where: { id: input.driverId, warehouseId, role: "DRIVER" } });
      if (!d) throw badRequest("Choose a driver from this warehouse");
    }
    data.driverId = input.driverId;
  }
  const updated = await db.shipment.update({ where: { id }, data });
  await audit(db, { userId: actor.userId, action: "shipment.assign", entityType: "Shipment", entityId: id, details: input as Prisma.InputJsonValue, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "shipment.assigned", message: `${s.trackingNumber} resources updated`, entityType: "Shipment", entityId: id, actorName: actor.name });
  return updated;
}

export async function changeShipmentStatus(
  db: Db,
  warehouseId: string,
  id: string,
  input: { status: ShipmentStatus; note?: string; delayMinutes?: number },
  actor: UserActor,
) {
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.findFirst({ where: { id, warehouseId }, include: { dock: true, vehicle: true } });
    if (!s) throw notFound("Shipment");
    const to = input.status;
    if (!canTransitionShipment(s.status, to)) throw badRequest(`Cannot move a shipment from ${s.status.toLowerCase().replace("_", " ")} to ${to.toLowerCase().replace("_", " ")}`);
    const now = new Date();
    const data: Prisma.ShipmentUncheckedUpdateInput = { status: to };
    if (to === "AT_DOCK" && !s.dockId) throw badRequest("Assign a dock first (use “Assign dock”)");
    if (to === "LOADING" || to === "READY") {
      if (to === "READY") data.loadingProgress = 100;
    }
    if (to === "IN_TRANSIT") {
      if (s.status !== "DELAYED") {
        data.departedAt = s.departedAt ?? now;
        if (s.direction === "OUTBOUND") {
          if (!s.vehicleId) throw badRequest("Assign a truck before departure");
          if (s.eta <= now) data.eta = new Date(now.getTime() + 30 * 60_000);
        }
      }
      if (s.dockId) await tx.dock.update({ where: { id: s.dockId }, data: { status: "AVAILABLE" } });
      if (s.direction === "OUTBOUND") data.dockId = s.dockId;
      if (s.vehicleId) await tx.vehicle.update({ where: { id: s.vehicleId }, data: { status: "IN_USE", onSite: false, locationLabel: `En route to ${s.destination}` } });
      if (s.direction === "OUTBOUND") {
        await tx.order.updateMany({ where: { shipmentId: s.id, status: { in: ["READY_FOR_DISPATCH", "PACKING"] } }, data: { status: "DISPATCHED", dispatchedAt: now } });
        // staged pallets for this shipment's orders leave the building
        await tx.pallet.deleteMany({ where: { warehouseId, status: "STAGED", lot: { in: (await tx.order.findMany({ where: { shipmentId: s.id }, select: { number: true } })).map((o) => o.number) } } });
      }
    }
    if (to === "DELAYED") {
      data.eta = new Date(Math.max(s.eta.getTime(), now.getTime()) + (input.delayMinutes ?? 30) * 60_000);
    }
    if (to === "DELIVERED") {
      data.deliveredAt = now;
      data.routeProgress = 1;
      if (s.direction === "OUTBOUND") {
        await tx.order.updateMany({ where: { shipmentId: s.id, status: "DISPATCHED" }, data: { status: "DELIVERED" } });
        if (s.vehicleId) await tx.vehicle.update({ where: { id: s.vehicleId }, data: { locationLabel: "Returning to base" } });
      } else if (s.dockId) {
        await tx.dock.update({ where: { id: s.dockId }, data: { status: "AVAILABLE" } });
      }
    }
    if (to === "CANCELLED") {
      if (s.dockId) await tx.dock.update({ where: { id: s.dockId }, data: { status: "AVAILABLE" } });
      if (s.vehicleId && s.vehicle?.onSite) {
        const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { settings: true } });
        const park = (wh.settings as { layout?: SiteLayout }).layout?.truckParking[0];
        await tx.vehicle.update({ where: { id: s.vehicleId }, data: { status: "AVAILABLE", locationLabel: "Truck parking", ...(park ? { posX: park.x, posZ: park.z, heading: park.heading } : {}) } });
      }
      await tx.order.updateMany({ where: { shipmentId: s.id }, data: { shipmentId: null } });
      await tx.task.updateMany({ where: { shipmentId: s.id, status: { in: ["PENDING", "IN_PROGRESS"] } }, data: { status: "CANCELLED", completedAt: now } });
    }
    const updated = await tx.shipment.update({ where: { id }, data });
    const label = { AT_DOCK: "At dock", LOADING: s.direction === "INBOUND" ? "Unloading started" : "Loading started", READY: "Loading complete", IN_TRANSIT: s.status === "DELAYED" ? "Back on schedule" : "Departed", DELAYED: "Delay reported", DELIVERED: s.direction === "INBOUND" ? "Received" : "Delivered", CANCELLED: "Cancelled", PLANNED: "Planned" }[to];
    await tx.shipmentEvent.create({
      data: { shipmentId: s.id, status: to, message: `${label}${input.note ? ` — ${input.note}` : ""} (${actor.name})`, location: to === "DELIVERED" ? s.destination : (s.dock?.name ?? null) },
    });
    await audit(tx, { userId: actor.userId, action: "shipment.status", entityType: "Shipment", entityId: id, details: { from: s.status, to, note: input.note ?? null }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: `shipment.${to.toLowerCase()}`, message: `${s.trackingNumber}: ${label.toLowerCase()}`, entityType: "Shipment", entityId: id, actorName: actor.name });
    return updated;
  });
}

export async function listCustomers(db: Db) {
  return db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, city: true } });
}
