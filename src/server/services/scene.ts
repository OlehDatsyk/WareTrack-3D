import type { Db } from "@/server/db";
import { notFound } from "@/server/errors";
import { pathLength, planRoute, rackAccessPoint, type SiteLayout, type Vec2 } from "@/lib/layout/geometry";

/** Everything the 3D view needs, in one compact payload. */
export async function getScene(db: Db, warehouseId: string) {
  const wh = await db.warehouse.findUnique({ where: { id: warehouseId } });
  if (!wh) throw notFound("Warehouse");
  const layout = (wh.settings as { layout?: SiteLayout }).layout!;

  const [zones, racks, pallets, docks, vehicles, tasks, dockShipments, locCounts] = await Promise.all([
    db.zone.findMany({ where: { warehouseId }, orderBy: { code: "asc" } }),
    db.rack.findMany({ where: { warehouseId }, orderBy: { code: "asc" } }),
    db.pallet.findMany({
      where: { warehouseId, locationId: { not: null } },
      select: {
        id: true,
        code: true,
        quantity: true,
        status: true,
        grossWeightKg: true,
        product: { select: { id: true, sku: true, name: true, category: true } },
        location: { select: { id: true, code: true, type: true, posX: true, posY: true, posZ: true, zoneId: true, rackId: true } },
      },
    }),
    db.dock.findMany({ where: { warehouseId }, orderBy: { code: "asc" } }),
    db.vehicle.findMany({
      where: { warehouseId },
      include: { operator: { select: { firstName: true, lastName: true } } },
      orderBy: { code: "asc" },
    }),
    db.task.findMany({
      where: { warehouseId, status: "IN_PROGRESS", vehicleId: { not: null } },
      include: {
        fromLocation: { include: { rack: true } },
        toLocation: { include: { rack: true } },
        pallet: { include: { location: { include: { rack: true } }, product: { select: { category: true, name: true } } } },
        shipment: { include: { dock: true } },
      },
    }),
    db.shipment.findMany({
      where: { warehouseId, dockId: { not: null }, status: { in: ["AT_DOCK", "LOADING", "READY"] } },
      include: { vehicle: { select: { id: true, code: true } } },
    }),
    db.storageLocation.groupBy({ by: ["zoneId"], where: { warehouseId }, _count: { _all: true } }),
  ]);

  const capByZone = new Map(locCounts.map((l) => [l.zoneId, l._count._all]));
  const occByZone = new Map<string, number>();
  for (const p of pallets) if (p.location) occByZone.set(p.location.zoneId, (occByZone.get(p.location.zoneId) ?? 0) + 1);
  const rackById = new Map(racks.map((r) => [r.id, r]));

  type Loc = { posX: number; posY: number; posZ: number; type: string; column: number; rack: (typeof racks)[number] | null };
  const access = (loc: Loc | null | undefined): (Vec2 & { y: number; heading: number }) | null => {
    if (!loc) return null;
    if (loc.rack) {
      const a = rackAccessPoint(loc.rack, loc.column);
      return { ...a, y: loc.posY, heading: loc.rack.aisleSide > 0 ? Math.PI : 0 };
    }
    return { x: loc.posX - 1.9, z: loc.posZ, y: loc.posY, heading: Math.PI / 2 };
  };
  const dockAccess = (d: { posX: number; posZ: number } | null | undefined) =>
    d ? { x: d.posX - 3.2, z: d.posZ, y: 0.2, heading: Math.PI / 2 } : null;

  const vehicleTask = new Map<string, unknown>();
  for (const t of tasks) {
    const v = vehicles.find((x) => x.id === t.vehicleId);
    if (!v) continue;
    const fromLoc = t.fromLocation ?? t.pallet?.location ?? null;
    const from = fromLoc ? access(fromLoc as Loc) : t.type === "UNLOAD" ? dockAccess(t.shipment?.dock) : null;
    const to = t.toLocation ? access(t.toLocation as Loc) : t.type === "LOAD" ? dockAccess(t.shipment?.dock) : null;
    if (!from || !to) continue;
    const start = { x: v.posX, z: v.posZ };
    const leg1 = planRoute(layout, start, from);
    const leg2 = planRoute(layout, from, to);
    const route = [...leg1, ...leg2.slice(1)];
    const l1 = pathLength(leg1);
    const total = Math.max(0.001, l1 + pathLength(leg2));
    vehicleTask.set(v.id, {
      id: t.id,
      number: t.number,
      type: t.type,
      progress: t.progress,
      route,
      pickupT: l1 / total,
      fromY: from.y,
      toY: to.y,
      palletId: t.palletId,
      cargoCategory: t.pallet?.product.category ?? null,
      description: t.description,
    });
  }

  const carriedPallets = new Set(tasks.map((t) => t.palletId).filter(Boolean) as string[]);

  return {
    warehouse: {
      id: wh.id,
      code: wh.code,
      name: wh.name,
      buildingWidth: wh.buildingWidth,
      buildingDepth: wh.buildingDepth,
      layout,
    },
    zones: zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      type: z.type,
      status: z.status,
      color: z.color,
      x: z.x,
      z: z.z,
      width: z.width,
      depth: z.depth,
      indoor: z.indoor,
      temperatureC: z.temperatureC,
      capacity: capByZone.get(z.id) ?? 0,
      occupied: occByZone.get(z.id) ?? 0,
    })),
    racks: racks.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind,
      zoneId: r.zoneId,
      posX: r.posX,
      posZ: r.posZ,
      rotation: r.rotation,
      length: r.length,
      depth: r.depth,
      levels: r.levels,
      columns: r.columns,
      levelHeight: r.levelHeight,
      aisleSide: r.aisleSide,
    })),
    pallets: pallets
      .filter((p) => !carriedPallets.has(p.id))
      .map((p) => ({
        id: p.id,
        code: p.code,
        quantity: p.quantity,
        status: p.status,
        weight: p.grossWeightKg,
        productId: p.product.id,
        sku: p.product.sku,
        product: p.product.name,
        category: p.product.category,
        locationId: p.location!.id,
        locationCode: p.location!.code,
        locationType: p.location!.type,
        rackId: p.location!.rackId,
        x: p.location!.posX,
        y: p.location!.posY,
        z: p.location!.posZ,
        rotated: !!(p.location!.rackId && rackById.get(p.location!.rackId)?.rotation),
      })),
    docks: docks.map((d) => {
      const s = dockShipments.find((x) => x.dockId === d.id);
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        direction: d.direction,
        status: d.status,
        posX: d.posX,
        posZ: d.posZ,
        shipment: s
          ? {
              id: s.id,
              trackingNumber: s.trackingNumber,
              status: s.status,
              carrier: s.carrier,
              direction: s.direction,
              loadingProgress: s.loadingProgress,
              vehicleId: s.vehicle?.id ?? null,
              vehicleCode: s.vehicle?.code ?? null,
            }
          : null,
      };
    }),
    vehicles: vehicles.map((v) => ({
      id: v.id,
      code: v.code,
      type: v.type,
      model: v.model,
      status: v.status,
      energyLevel: v.energyLevel,
      onSite: v.onSite,
      posX: v.posX,
      posZ: v.posZ,
      heading: v.heading,
      carrier: v.carrier,
      operator: v.operator ? `${v.operator.firstName} ${v.operator.lastName}` : null,
      locationLabel: v.locationLabel,
      task: (vehicleTask.get(v.id) as SceneTask | undefined) ?? null,
    })),
  };
}

export type SceneTask = {
  id: string;
  number: string;
  type: string;
  progress: number;
  route: Vec2[];
  pickupT: number;
  fromY: number;
  toY: number;
  palletId: string | null;
  cargoCategory: string | null;
  description: string;
};

export type SceneData = Awaited<ReturnType<typeof getScene>>;
