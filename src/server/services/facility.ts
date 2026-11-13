/** Racks, docks and zones. */
import type { Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ZoneStatus } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity, notify } from "@/server/audit";
import type { Actor } from "./operations";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

export async function getRack(db: Db, warehouseId: string, id: string) {
  const rack = await db.rack.findFirst({
    where: { id, warehouseId },
    include: {
      zone: { select: { id: true, name: true, code: true, status: true, temperatureC: true } },
      locations: {
        orderBy: [{ level: "desc" }, { column: "asc" }],
        select: {
          id: true,
          code: true,
          level: true,
          column: true,
          isBlocked: true,
          maxWeightKg: true,
          pallet: { select: { id: true, code: true, quantity: true, status: true, product: { select: { id: true, sku: true, name: true } } } },
        },
      },
    },
  });
  if (!rack) throw notFound("Rack");
  const occupied = rack.locations.filter((l) => l.pallet).length;
  const products = new Map<string, { id: string; sku: string; name: string; pallets: number; units: number }>();
  for (const l of rack.locations) {
    if (!l.pallet) continue;
    const p = l.pallet.product;
    const e = products.get(p.id) ?? { id: p.id, sku: p.sku, name: p.name, pallets: 0, units: 0 };
    e.pallets += 1;
    e.units += l.pallet.quantity;
    products.set(p.id, e);
  }
  return {
    ...rack,
    capacity: rack.locations.length,
    occupied,
    available: rack.locations.filter((l) => !l.pallet && !l.isBlocked).length,
    blocked: rack.locations.filter((l) => l.isBlocked).length,
    utilization: rack.locations.length ? (occupied / rack.locations.length) * 100 : 0,
    products: [...products.values()].sort((a, b) => b.units - a.units),
  };
}

export async function setLocationBlocked(db: Db, warehouseId: string, locationId: string, blocked: boolean, actor: UserActor) {
  const loc = await db.storageLocation.findFirst({ where: { id: locationId, warehouseId }, include: { pallet: true } });
  if (!loc) throw notFound("Location");
  if (blocked && loc.pallet) throw badRequest("Move the pallet out before blocking this location");
  const updated = await db.storageLocation.update({ where: { id: loc.id }, data: { isBlocked: blocked } });
  await audit(db, { userId: actor.userId, action: blocked ? "location.block" : "location.unblock", entityType: "StorageLocation", entityId: loc.id, details: { code: loc.code }, ip: actor.ip });
  return updated;
}

// ───────────────────────────── Docks ─────────────────────────────

export async function getDock(db: Db, warehouseId: string, id: string) {
  const dock = await db.dock.findFirst({ where: { id, warehouseId } });
  if (!dock) throw notFound("Dock");
  const [current, upcoming] = await Promise.all([
    db.shipment.findFirst({
      where: { dockId: id, status: { in: ["AT_DOCK", "LOADING", "READY"] } },
      include: { vehicle: { select: { id: true, code: true } }, driver: { select: { firstName: true, lastName: true } }, _count: { select: { orders: true } } },
    }),
    db.shipment.findMany({
      where: {
        warehouseId,
        direction: dock.direction,
        status: { in: ["PLANNED", "IN_TRANSIT", "DELAYED"] },
        ...(dock.direction === "OUTBOUND" ? { status: "PLANNED" } : {}),
      },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      select: { id: true, trackingNumber: true, status: true, carrier: true, destination: true, origin: true, scheduledAt: true, eta: true, direction: true },
    }),
  ]);
  return { ...dock, current, upcoming };
}

export async function setDockStatus(db: Db, warehouseId: string, id: string, status: "AVAILABLE" | "MAINTENANCE", actor: UserActor) {
  const dock = await db.dock.findFirst({ where: { id, warehouseId } });
  if (!dock) throw notFound("Dock");
  const busy = await db.shipment.count({ where: { dockId: id, status: { in: ["AT_DOCK", "LOADING", "READY"] } } });
  if (busy && status === "MAINTENANCE") throw conflict(`${dock.name} has a vehicle at the dock`);
  const updated = await db.dock.update({ where: { id }, data: { status: busy ? "OCCUPIED" : status } });
  await audit(db, { userId: actor.userId, action: "dock.status", entityType: "Dock", entityId: id, details: { status }, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "dock.status", message: `${dock.name} set to ${status.toLowerCase()}`, entityType: "Dock", entityId: id, actorName: actor.name });
  return updated;
}

/** Puts a shipment on a dock (with an optional truck for outbound shipments). */
export async function assignShipmentToDock(db: Db, warehouseId: string, shipmentId: string, input: { dockId: string; vehicleId?: string | null }, actor: UserActor) {
  return db.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id: shipmentId, warehouseId } });
    if (!shipment) throw notFound("Shipment");
    if (["DELIVERED", "CANCELLED", "IN_TRANSIT", "DELAYED"].includes(shipment.status) && shipment.direction === "OUTBOUND") {
      throw badRequest(`Shipment is ${shipment.status.toLowerCase().replace("_", " ")} and cannot be docked`);
    }
    if (shipment.status === "DELIVERED" || shipment.status === "CANCELLED") throw badRequest("Shipment is closed");
    const dock = await tx.dock.findFirst({ where: { id: input.dockId, warehouseId } });
    if (!dock) throw notFound("Dock");
    if (dock.direction !== shipment.direction) throw badRequest(`${dock.name} handles ${dock.direction.toLowerCase()} traffic only`);
    if (dock.status !== "AVAILABLE" && shipment.dockId !== dock.id) throw conflict(`${dock.name} is ${dock.status.toLowerCase()}`);

    let vehicleId = shipment.vehicleId;
    if (shipment.direction === "OUTBOUND") {
      vehicleId = input.vehicleId ?? shipment.vehicleId;
      if (!vehicleId) throw badRequest("Choose a truck for this outbound shipment");
      const v = await tx.vehicle.findFirst({ where: { id: vehicleId, warehouseId } });
      if (!v || (v.type !== "TRUCK" && v.type !== "VAN")) throw badRequest("Choose a truck or van");
      if (v.id !== shipment.vehicleId && (v.status !== "AVAILABLE" || !v.onSite)) throw conflict(`${v.code} is not available on site`);
      await tx.vehicle.update({
        where: { id: v.id },
        data: { status: "IN_USE", onSite: true, locationLabel: `${dock.name} (at dock)`, posX: dock.posX + 8, posZ: dock.posZ, heading: -Math.PI / 2 },
      });
    }
    if (shipment.dockId && shipment.dockId !== dock.id) {
      await tx.dock.update({ where: { id: shipment.dockId }, data: { status: "AVAILABLE" } });
    }
    await tx.dock.update({ where: { id: dock.id }, data: { status: "OCCUPIED" } });
    const updated = await tx.shipment.update({
      where: { id: shipment.id },
      data: { dockId: dock.id, vehicleId, status: shipment.status === "PLANNED" || shipment.status === "IN_TRANSIT" || shipment.status === "DELAYED" ? "AT_DOCK" : shipment.status, routeProgress: shipment.direction === "INBOUND" ? 1 : shipment.routeProgress },
    });
    await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: "AT_DOCK", message: `Assigned to ${dock.name} by ${actor.name}`, location: dock.name } });
    await audit(tx, { userId: actor.userId, action: "shipment.assign_dock", entityType: "Shipment", entityId: shipment.id, details: { dock: dock.name, vehicleId }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "shipment.at_dock", message: `${shipment.trackingNumber} assigned to ${dock.name}`, entityType: "Shipment", entityId: shipment.id, actorName: actor.name });
    return updated;
  });
}

// ───────────────────────────── Zones ─────────────────────────────

export async function listZones(db: Db, warehouseId: string) {
  const zones = await db.zone.findMany({
    where: { warehouseId },
    orderBy: { code: "asc" },
    include: {
      _count: { select: { locations: true, racks: true, employees: true } },
    },
  });
  const occupied = await db.storageLocation.groupBy({ by: ["zoneId"], where: { warehouseId, pallet: { isNot: null } }, _count: { _all: true } });
  const blocked = await db.storageLocation.groupBy({ by: ["zoneId"], where: { warehouseId, isBlocked: true }, _count: { _all: true } });
  const stock = await db.inventoryItem.groupBy({ by: ["zoneId"], where: { warehouseId }, _sum: { quantity: true, damaged: true } });
  const openTasks = await db.task.findMany({
    where: { warehouseId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: { fromLocation: { select: { zoneId: true } }, toLocation: { select: { zoneId: true } } },
  });
  const ops = new Map<string, number>();
  for (const t of openTasks) {
    for (const z of new Set([t.fromLocation?.zoneId, t.toLocation?.zoneId].filter(Boolean) as string[])) ops.set(z, (ops.get(z) ?? 0) + 1);
  }
  const occ = new Map(occupied.map((o) => [o.zoneId, o._count._all]));
  const blk = new Map(blocked.map((o) => [o.zoneId, o._count._all]));
  const stk = new Map(stock.map((o) => [o.zoneId, o._sum]));
  return zones.map((z) => ({
    ...z,
    capacity: z._count.locations,
    occupied: occ.get(z.id) ?? 0,
    blocked: blk.get(z.id) ?? 0,
    units: stk.get(z.id)?.quantity ?? 0,
    damagedUnits: stk.get(z.id)?.damaged ?? 0,
    openOperations: ops.get(z.id) ?? 0,
    staff: z._count.employees,
    racks: z._count.racks,
  }));
}

export async function getZone(db: Db, warehouseId: string, id: string) {
  const zones = await listZones(db, warehouseId);
  const zone = zones.find((z) => z.id === id);
  if (!zone) throw notFound("Zone");
  const [topProducts, staff, tasks] = await Promise.all([
    db.inventoryItem.findMany({
      where: { zoneId: id, OR: [{ quantity: { gt: 0 } }, { damaged: { gt: 0 } }] },
      orderBy: { quantity: "desc" },
      take: 8,
      include: { product: { select: { id: true, sku: true, name: true } } },
    }),
    db.employee.findMany({ where: { zoneId: id }, select: { id: true, firstName: true, lastName: true, role: true, status: true } }),
    db.task.findMany({
      where: { warehouseId, status: { in: ["PENDING", "IN_PROGRESS"] }, OR: [{ fromLocation: { zoneId: id } }, { toLocation: { zoneId: id } }] },
      select: { id: true, number: true, type: true, status: true, description: true, progress: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { ...zone, topProducts, staff, tasks };
}

export async function updateZone(
  db: Db,
  warehouseId: string,
  id: string,
  input: Prisma.ZoneUpdateInput & { status?: ZoneStatus; statusReason?: string },
  actor: UserActor,
) {
  const zone = await db.zone.findFirst({ where: { id, warehouseId } });
  if (!zone) throw notFound("Zone");
  const { statusReason, ...data } = input;
  if (data.code && data.code !== zone.code) {
    const dup = await db.zone.findFirst({ where: { warehouseId, code: data.code as string } });
    if (dup) throw conflict(`Zone code ${data.code} is already used`);
  }
  const updated = await db.zone.update({ where: { id }, data });
  const statusChanged = input.status && input.status !== zone.status;
  await audit(db, { userId: actor.userId, action: statusChanged ? "zone.status" : "zone.update", entityType: "Zone", entityId: id, details: { ...(input as object), previousStatus: zone.status } as Prisma.InputJsonValue, ip: actor.ip });
  if (statusChanged) {
    await logActivity(db, {
      warehouseId,
      type: "zone.status",
      message: `${zone.name} set to ${input.status!.toLowerCase()}${statusReason ? ` — ${statusReason}` : ""}`,
      entityType: "Zone",
      entityId: id,
      actorName: actor.name,
    });
    if (input.status === "MAINTENANCE" || input.status === "CLOSED") {
      await notify(db, {
        warehouseId,
        category: "CAPACITY",
        priority: "MEDIUM",
        title: `${zone.name} ${input.status.toLowerCase()}`,
        message: statusReason ? statusReason : `${zone.name} cannot receive stock until it is reactivated.`,
        link: `/zones?id=${zone.id}`,
        entityType: "Zone",
        entityId: zone.id,
      });
    }
  }
  return updated;
}

export async function createZone(
  db: Db,
  warehouseId: string,
  input: { code: string; name: string; type: Prisma.ZoneCreateManyInput["type"]; status: ZoneStatus; temperatureC?: number | null; color: string; notes?: string | null; x: number; z: number; width: number; depth: number; indoor: boolean; floorSlots: number },
  actor: UserActor,
) {
  const dup = await db.zone.findFirst({ where: { warehouseId, code: input.code } });
  if (dup) throw conflict(`Zone code ${input.code} is already used`);
  return db.$transaction(async (tx) => {
    const { floorSlots, ...data } = input;
    const zone = await tx.zone.create({ data: { ...data, warehouseId } });
    if (floorSlots > 0) {
      const cols = Math.max(1, Math.floor((input.width - 1) / 2.4));
      const rows = Math.ceil(floorSlots / cols);
      const locs: Prisma.StorageLocationCreateManyInput[] = [];
      for (let i = 0; i < floorSlots; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        locs.push({
          warehouseId,
          zoneId: zone.id,
          code: `${input.code}-F${String(i + 1).padStart(2, "0")}`,
          type: "FLOOR",
          column: c,
          level: r,
          posX: input.x - input.width / 2 + 1.6 + c * 2.4,
          posY: 0,
          posZ: input.z - input.depth / 2 + 1.6 + r * Math.min(2.6, (input.depth - 2) / Math.max(1, rows)),
        });
      }
      await tx.storageLocation.createMany({ data: locs });
    }
    await audit(tx, { userId: actor.userId, action: "zone.create", entityType: "Zone", entityId: zone.id, details: { code: zone.code, name: zone.name }, ip: actor.ip });
    return zone;
  });
}

export async function deleteZone(db: Db, warehouseId: string, id: string, actor: UserActor) {
  const zone = await db.zone.findFirst({ where: { id, warehouseId } });
  if (!zone) throw notFound("Zone");
  const [pallets, stock] = await Promise.all([
    db.pallet.count({ where: { location: { zoneId: id } } }),
    db.inventoryItem.aggregate({ where: { zoneId: id }, _sum: { quantity: true, damaged: true } }),
  ]);
  if (pallets > 0 || (stock._sum.quantity ?? 0) > 0 || (stock._sum.damaged ?? 0) > 0) {
    throw conflict("Zone still holds stock. Move all pallets and stock out first.");
  }
  await db.zone.delete({ where: { id } });
  await audit(db, { userId: actor.userId, action: "zone.delete", entityType: "Zone", entityId: id, details: { code: zone.code }, ip: actor.ip });
  return { id };
}
