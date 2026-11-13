import type { Db } from "@/server/db";
import { ensureTodaySnapshot, todayUtc } from "@/server/simulation/engine";

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  format: "number" | "percent" | "compact";
  comparison: string;
  /** whether an increase is good (drives delta colour) */
  upIsGood: boolean | null;
  spark: number[];
  source: "live" | "history";
  hint: string;
};

const DAY = 86_400_000;

export async function getDashboard(db: Db, warehouseId: string, now = new Date()) {
  await ensureTodaySnapshot(db, warehouseId, now);
  const today = todayUtc(now);
  const snapshots = await db.metricSnapshot.findMany({
    where: { warehouseId, date: { gte: new Date(today.getTime() - 60 * DAY) } },
    orderBy: { date: "asc" },
  });
  const todaySnap = snapshots.find((s) => s.date.getTime() === today.getTime());
  const history = snapshots.filter((s) => s.date.getTime() < today.getTime());
  const yesterday = history[history.length - 1];
  const last14 = history.slice(-13);
  const spark = (pick: (s: (typeof snapshots)[number]) => number, live?: number) => [
    ...last14.map(pick),
    live ?? (todaySnap ? pick(todaySnap) : 0),
  ];

  const [inv, activeTasks, loadingShipments, trucksOnSite, inboundAtDock, backlog, occupied, capacity] = await Promise.all([
    db.inventoryItem.aggregate({ where: { warehouseId }, _sum: { quantity: true } }),
    db.task.count({ where: { warehouseId, status: "IN_PROGRESS" } }),
    db.shipment.count({ where: { warehouseId, status: { in: ["AT_DOCK", "LOADING"] } } }),
    db.vehicle.count({ where: { warehouseId, type: "TRUCK", onSite: true } }),
    db.shipment.count({ where: { warehouseId, direction: "INBOUND", status: { in: ["AT_DOCK", "LOADING"] }, vehicleId: null } }),
    db.order.count({ where: { warehouseId, status: { in: ["PENDING", "PROCESSING", "PICKING", "PACKING"] } } }),
    db.storageLocation.count({ where: { warehouseId, pallet: { isNot: null } } }),
    db.storageLocation.count({ where: { warehouseId } }),
  ]);

  // On-time delivery from real shipment records over the last 30 days
  const delivered = await db.shipment.findMany({
    where: { warehouseId, direction: "OUTBOUND", status: "DELIVERED", deliveredAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    select: { deliveredAt: true, eta: true },
  });
  const onTime = delivered.filter((s) => s.deliveredAt! <= new Date(s.eta.getTime() + 15 * 60_000)).length;
  const onTimeRate = delivered.length ? (onTime / delivered.length) * 100 : (yesterday?.onTimeRate ?? 0);
  const prevOnTime = history.slice(-60, -30);
  const prevOnTimeRate = prevOnTime.length ? prevOnTime.reduce((s, x) => s + x.onTimeRate, 0) / prevOnTime.length : null;

  const unitsOnHand = inv._sum.quantity ?? 0;
  const utilization = capacity ? (occupied / capacity) * 100 : 0;
  const dayFraction = Math.min(1, Math.max(0.01, (now.getTime() - today.getTime()) / DAY));
  const throughputToday = todaySnap?.unitsPicked ?? 0;
  const throughputPrev = yesterday ? Math.round(yesterday.unitsPicked * dayFraction) : null;

  const kpis: Kpi[] = [
    {
      key: "stock",
      label: "Stock on hand",
      value: unitsOnHand,
      previous: yesterday?.unitsOnHand ?? null,
      format: "compact",
      comparison: "vs yesterday",
      upIsGood: null,
      spark: spark((s) => s.unitsOnHand, unitsOnHand),
      source: "live",
      hint: "Good units on hand across all zones (excludes staged outbound and damaged stock).",
    },
    {
      key: "operations",
      label: "Active operations",
      value: activeTasks + loadingShipments,
      previous: yesterday?.activeOperations ?? null,
      format: "number",
      comparison: "vs yesterday",
      upIsGood: true,
      spark: spark((s) => s.activeOperations, activeTasks + loadingShipments),
      source: "live",
      hint: "Tasks in progress plus trailers being loaded or unloaded.",
    },
    {
      key: "trucks",
      label: "Trucks on site",
      value: trucksOnSite + inboundAtDock,
      previous: yesterday?.trucksOnSite ?? null,
      format: "number",
      comparison: "vs yesterday",
      upIsGood: null,
      spark: spark((s) => s.trucksOnSite, trucksOnSite + inboundAtDock),
      source: "live",
      hint: "Fleet trucks on site plus carrier trailers at inbound docks.",
    },
    {
      key: "backlog",
      label: "Orders awaiting fulfilment",
      value: backlog,
      previous: yesterday?.ordersBacklog ?? null,
      format: "number",
      comparison: "vs yesterday",
      upIsGood: false,
      spark: spark((s) => s.ordersBacklog, backlog),
      source: "live",
      hint: "Orders that are pending, processing, being picked or packed.",
    },
    {
      key: "ontime",
      label: "On-time delivery",
      value: onTimeRate,
      previous: prevOnTimeRate,
      format: "percent",
      comparison: "vs prior 30 days",
      upIsGood: true,
      spark: spark((s) => s.onTimeRate, onTimeRate),
      source: "live",
      hint: "Outbound shipments delivered within 15 minutes of ETA over the last 30 days.",
    },
    {
      key: "utilization",
      label: "Warehouse utilisation",
      value: utilization,
      previous: yesterday?.utilization ?? null,
      format: "percent",
      comparison: "vs yesterday",
      upIsGood: null,
      spark: spark((s) => s.utilization, utilization),
      source: "live",
      hint: `${occupied.toLocaleString()} of ${capacity.toLocaleString()} storage positions occupied.`,
    },
    {
      key: "accuracy",
      label: "Inventory accuracy",
      value: yesterday?.inventoryAccuracy ?? 0,
      previous: history[history.length - 2]?.inventoryAccuracy ?? null,
      format: "percent",
      comparison: "vs previous count",
      upIsGood: true,
      spark: last14.map((s) => s.inventoryAccuracy),
      source: "history",
      hint: "Result of the latest cycle count (demo history).",
    },
    {
      key: "throughput",
      label: "Units picked today",
      value: throughputToday,
      previous: throughputPrev,
      format: "compact",
      comparison: "vs same time yesterday",
      upIsGood: true,
      spark: spark((s) => s.unitsPicked),
      source: "live",
      hint: "Daily throughput: units picked so far today.",
    },
  ];

  const [activity, shipments, orders, alerts, zones] = await Promise.all([
    db.activityEvent.findMany({ where: { warehouseId }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.shipment.findMany({
      where: { warehouseId, status: { in: ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"] } },
      include: { vehicle: { select: { code: true } }, dock: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { eta: "asc" }],
      take: 8,
    }),
    db.order.findMany({
      where: { warehouseId, status: { in: ["PENDING", "PROCESSING"] } },
      include: { customer: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ priority: "desc" }, { requiredDispatchAt: "asc" }],
      take: 6,
    }),
    db.notification.findMany({
      where: { warehouseId, priority: { in: ["HIGH", "CRITICAL"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.zone.findMany({
      where: { warehouseId },
      select: { id: true, code: true, name: true, status: true, color: true, _count: { select: { locations: true } } },
      orderBy: { code: "asc" },
    }),
  ]);
  const occupiedByZone = await db.storageLocation.groupBy({
    by: ["zoneId"],
    where: { warehouseId, pallet: { isNot: null } },
    _count: { _all: true },
  });
  const occMap = new Map(occupiedByZone.map((o) => [o.zoneId, o._count._all]));

  return {
    generatedAt: now,
    kpis,
    performance: [...history.slice(-13), ...(todaySnap ? [todaySnap] : [])].map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      ordersReceived: s.ordersReceived,
      ordersShipped: s.ordersShipped,
      onTimeRate: s.onTimeRate,
      partial: s.date.getTime() === today.getTime(),
    })),
    activity,
    shipments: shipments.map((s) => ({
      id: s.id,
      trackingNumber: s.trackingNumber,
      direction: s.direction,
      status: s.status,
      carrier: s.carrier,
      destination: s.direction === "INBOUND" ? s.origin : s.destination,
      vehicle: s.vehicle?.code ?? null,
      dock: s.dock?.name ?? null,
      loadingProgress: s.loadingProgress,
      routeProgress: s.routeProgress,
      eta: s.eta,
      simulated: s.simulated,
    })),
    pendingOrders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customer: o.customer.name,
      status: o.status,
      priority: o.priority,
      lines: o._count.items,
      requiredDispatchAt: o.requiredDispatchAt,
      overdue: o.requiredDispatchAt < now,
      simulated: o.simulated,
    })),
    alerts,
    zones: zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      status: z.status,
      color: z.color,
      capacity: z._count.locations,
      occupied: occMap.get(z.id) ?? 0,
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
