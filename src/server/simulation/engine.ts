/**
 * Deterministic demo simulation.
 *
 * The simulation is advanced lazily: whenever a client polls /api/simulation and the
 * configured interval has elapsed, exactly one tick runs (concurrent pollers are
 * de-duplicated with an optimistic lock on `tick`). Randomness comes from a PRNG seeded
 * with (seed, tick), so the same database state + tick always produces the same decisions.
 *
 * Every record the simulation creates is flagged `simulated = true` and shown with a SIM
 * badge in the UI. The simulation uses the same services as user actions, so stock,
 * orders and shipments stay consistent.
 */
import type { Db, Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { createRng, hashSeed, type Rng } from "@/lib/rng";
import type { SiteLayout } from "@/lib/layout/geometry";
import { logActivity, notify } from "@/server/audit";
import {
  FORKLIFT_TASKS,
  completeTask,
  createTask,
  findFreeLocation,
  nextNumber,
  startTask,
  type Actor,
} from "@/server/services/operations";
import { reserveStock } from "@/server/services/stock";
import { CARRIERS, CITY_MAP } from "@/server/seed/catalog";

const SIM: Actor = { userId: null, name: "Simulation", simulated: true };
const MIN = 60_000;
const TX_OPTS = { timeout: 20_000, maxWait: 10_000 };

export type TickResult = { advanced: boolean; tick: number; events: string[] };

export async function getSimulationState(db: Db, warehouseId: string) {
  return db.simulationState.upsert({
    where: { warehouseId },
    create: { warehouseId },
    update: {},
  });
}

export async function setSimulationRunning(db: Db, warehouseId: string, running: boolean) {
  await getSimulationState(db, warehouseId);
  return db.simulationState.update({ where: { warehouseId }, data: { running, lastTickAt: new Date() } });
}

/** Runs one tick if the simulation is running and the interval has elapsed. */
export async function maybeAdvance(db: Db, warehouseId: string, now = new Date()): Promise<TickResult> {
  const state = await getSimulationState(db, warehouseId);
  if (!state.running) return { advanced: false, tick: state.tick, events: [] };
  if (now.getTime() - state.lastTickAt.getTime() < state.intervalMs * 0.9) {
    return { advanced: false, tick: state.tick, events: [] };
  }
  // optimistic lock: only one concurrent request wins this tick
  const claimed = await db.simulationState.updateMany({
    where: { warehouseId, tick: state.tick },
    data: { tick: state.tick + 1, lastTickAt: now },
  });
  if (claimed.count === 0) return { advanced: false, tick: state.tick, events: [] };
  const events = await runTick(db, warehouseId, state.tick + 1, state.seed, now);
  return { advanced: true, tick: state.tick + 1, events };
}

type Step = (ctx: StepCtx) => Promise<void>;
type StepCtx = { tx: Tx; warehouseId: string; rng: Rng; now: Date; tick: number; events: string[]; layout: SiteLayout };

export async function runTick(db: Db, warehouseId: string, tick: number, seed: number, now = new Date()): Promise<string[]> {
  const events: string[] = [];
  const wh = await db.warehouse.findUnique({ where: { id: warehouseId }, select: { settings: true } });
  const layout = (wh?.settings as { layout?: SiteLayout } | null)?.layout;
  if (!layout) return events;
  const steps: [string, Step][] = [
    ["tasks", progressTasks],
    ["energy", energyAndCharging],
    ["inbound", inboundFlow],
    ["putaway", schedulePutaways],
    ["orders", orderFlow],
    ["outbound", outboundFlow],
    ["returns", vehicleReturns],
    ["start", startPendingTasks],
    ["alerts", alerts],
    ["metrics", metrics],
  ];
  for (const [name, step] of steps) {
    const rng = createRng(hashSeed(seed, tick, name));
    try {
      await db.$transaction((tx) => step({ tx, warehouseId, rng, now, tick, events, layout }), TX_OPTS);
    } catch (err) {
      console.warn(`[simulation] step "${name}" failed at tick ${tick}:`, (err as Error).message);
    }
  }
  return events;
}

// ───────────────────────────── steps ─────────────────────────────

async function progressTasks({ tx, warehouseId, rng, events }: StepCtx) {
  const tasks = await tx.task.findMany({ where: { warehouseId, status: "IN_PROGRESS" }, orderBy: { startedAt: "asc" } });
  for (const t of tasks) {
    const inc = FORKLIFT_TASKS.includes(t.type) ? rng.int(10, 16) : t.type === "PICK" ? rng.int(12, 22) : rng.int(10, 18);
    if (t.progress + inc >= 100) {
      try {
        const { summary } = await completeTask(tx, t.id, SIM);
        events.push(summary);
        if (t.type === "PICK") await bumpMetric(tx, warehouseId, { unitsPicked: rng.int(8, 40) });
      } catch (err) {
        // target became invalid (e.g. zone closed by a user) — cancel so resources free up
        await tx.task.update({ where: { id: t.id }, data: { status: "CANCELLED", completedAt: new Date() } });
        if (t.vehicleId) await tx.vehicle.update({ where: { id: t.vehicleId }, data: { status: "AVAILABLE", locationLabel: "Idle" } });
        events.push(`${t.number} cancelled: ${(err as Error).message}`);
      }
    } else {
      await tx.task.update({ where: { id: t.id }, data: { progress: t.progress + inc } });
    }
  }
}

async function energyAndCharging({ tx, warehouseId, rng, layout }: StepCtx) {
  const lifts = await tx.vehicle.findMany({
    where: { warehouseId, type: { in: ["FORKLIFT", "REACH_TRUCK"] } },
    orderBy: { code: "asc" },
  });
  for (const [i, v] of lifts.entries()) {
    const home = layout.chargeSpots[i % layout.chargeSpots.length]!;
    if (v.status === "IN_USE" && rng.chance(0.3)) {
      await tx.vehicle.update({ where: { id: v.id }, data: { energyLevel: Math.max(0, v.energyLevel - 1) } });
    } else if (v.status === "CHARGING") {
      const level = Math.min(100, v.energyLevel + rng.int(4, 7));
      await tx.vehicle.update({
        where: { id: v.id },
        data: level >= 96 ? { energyLevel: level, status: "AVAILABLE", locationLabel: "Charging bay" } : { energyLevel: level },
      });
    } else if (v.status === "AVAILABLE") {
      const atHome = Math.hypot(v.posX - home.x, v.posZ - home.z) < 0.5;
      if (v.energyLevel < 25) {
        await tx.vehicle.update({
          where: { id: v.id },
          data: { status: "CHARGING", locationLabel: "Charging bay", posX: home.x, posZ: home.z, heading: home.heading },
        });
      } else if (!atHome && rng.chance(0.35)) {
        const pending = await tx.task.count({ where: { warehouseId, status: "PENDING" } });
        if (pending === 0) {
          await tx.vehicle.update({
            where: { id: v.id },
            data: { posX: home.x, posZ: home.z, heading: home.heading, locationLabel: "Charging bay" },
          });
        }
      }
    }
  }
}

async function schedulePutaways({ tx, warehouseId, events }: StepCtx) {
  const received = await tx.pallet.findMany({
    where: {
      warehouseId,
      status: "RECEIVED",
      location: { zone: { type: "RECEIVING" } },
      tasks: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } },
    },
    include: { location: true, product: { select: { name: true } } },
    orderBy: { receivedAt: "asc" },
    take: 2,
  });
  for (const p of received) {
    const target = await findFreeLocation(tx, warehouseId, {
      zoneTypes: ["STORAGE"],
      types: ["RACK"],
      preferProductId: p.productId,
      maxWeightAtLeast: p.grossWeightKg,
    });
    if (!target) break;
    const task = await createTask(
      tx,
      {
        warehouseId,
        type: "PUTAWAY",
        description: `Put away ${p.code} (${p.product.name}) to ${target.code}`,
        palletId: p.id,
        fromLocationId: p.locationId,
        toLocationId: target.id,
      },
      SIM,
    );
    events.push(`${task.number} created: put away ${p.code}`);
  }
}

async function orderFlow({ tx, warehouseId, rng, now, events }: StepCtx) {
  // PENDING → PROCESSING (reserve stock)
  const pending = await tx.order.findMany({
    where: { warehouseId, status: "PENDING", createdAt: { lt: new Date(now.getTime() - 20_000) } },
    include: { items: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 2,
  });
  for (const o of pending) {
    if (!rng.chance(0.4)) continue;
    for (const item of o.items) await reserveStock(tx, { warehouseId, productId: item.productId, qty: item.quantity - item.pickedQty });
    await tx.order.update({ where: { id: o.id }, data: { status: "PROCESSING" } });
    await logActivity(tx, { warehouseId, type: "order.processing", message: `${o.number} released for picking`, entityType: "Order", entityId: o.id, simulated: true });
    events.push(`${o.number} released`);
  }

  // PROCESSING → PICKING (create pick task)
  const processing = await tx.order.findMany({
    where: { warehouseId, status: "PROCESSING", tasks: { none: { type: "PICK", status: { in: ["PENDING", "IN_PROGRESS"] } } } },
    include: { items: true, customer: { select: { name: true } } },
    take: 2,
  });
  for (const o of processing) {
    if (!rng.chance(0.5)) continue;
    const units = o.items.reduce((s, i) => s + i.quantity - i.pickedQty, 0);
    await createTask(tx, { warehouseId, type: "PICK", description: `Pick ${units} units for ${o.number} (${o.customer.name})`, orderId: o.id, priority: o.priority }, SIM);
    await tx.order.update({ where: { id: o.id }, data: { status: "PICKING" } });
  }

  // PACKING → READY_FOR_DISPATCH (+ staged pallet in dispatch)
  const packing = await tx.order.findMany({
    where: { warehouseId, status: "PACKING" },
    include: { items: { include: { product: true } } },
    orderBy: { updatedAt: "asc" },
    take: 2,
  });
  for (const o of packing) {
    if (!rng.chance(0.3)) continue;
    const slot = await findFreeLocation(tx, warehouseId, { zoneTypes: ["DISPATCH"], types: ["FLOOR"] });
    if (slot && o.items.length) {
      const main = [...o.items].sort((a, b) => b.quantity - a.quantity)[0]!;
      const units = o.items.reduce((s, i) => s + i.pickedQty, 0);
      const weight = o.items.reduce((s, i) => s + i.pickedQty * i.product.unitWeightKg, 0) + 22;
      await tx.pallet.create({
        data: {
          code: await nextNumber(tx, "pallet"),
          warehouseId,
          productId: main.productId,
          locationId: slot.id,
          quantity: Math.max(1, units),
          lot: o.number,
          status: "STAGED",
          grossWeightKg: Math.round(weight * 10) / 10,
        },
      });
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "READY_FOR_DISPATCH" } });
    await logActivity(tx, { warehouseId, type: "order.ready", message: `${o.number} packed and staged for dispatch`, entityType: "Order", entityId: o.id, simulated: true });
    events.push(`${o.number} ready for dispatch`);
  }

  // New simulated customer orders
  if (rng.chance(0.12)) {
    const customers = await tx.customer.findMany({ select: { id: true } });
    const stocked = await tx.inventoryItem.findMany({
      where: { warehouseId, quantity: { gt: 40 }, zone: { type: { in: ["STORAGE", "PICKING"] } } },
      select: { productId: true },
      distinct: ["productId"],
      take: 40,
    });
    if (customers.length && stocked.length) {
      const n = rng.int(1, 3);
      const items = new Map<string, number>();
      for (let i = 0; i < n; i++) items.set(rng.pick(stocked).productId, rng.int(2, 12));
      const number = await nextNumber(tx, "order");
      const o = await tx.order.create({
        data: {
          number,
          warehouseId,
          customerId: rng.pick(customers).id,
          priority: rng.pick(["NORMAL", "NORMAL", "HIGH", "LOW", "URGENT", "NORMAL"] as const),
          requiredDispatchAt: new Date(now.getTime() + rng.int(4, 30) * 60 * MIN),
          simulated: true,
          items: { create: [...items.entries()].map(([productId, quantity]) => ({ productId, quantity })) },
        },
      });
      await bumpMetric(tx, warehouseId, { ordersReceived: 1 });
      await logActivity(tx, { warehouseId, type: "order.created", message: `New order ${o.number} received`, entityType: "Order", entityId: o.id, simulated: true });
      events.push(`New order ${number}`);
    }
  }
}

async function outboundFlow({ tx, warehouseId, rng, now, events, layout }: StepCtx) {
  // Bring planned shipments (or ready orders) to a free dock
  const freeDock = () =>
    tx.dock.findFirst({ where: { warehouseId, direction: "OUTBOUND", status: "AVAILABLE" }, orderBy: { code: "asc" } });
  const freeTruck = () =>
    tx.vehicle.findFirst({ where: { warehouseId, type: "TRUCK", status: "AVAILABLE", onSite: true }, orderBy: { energyLevel: "desc" } });

  const readyUnassigned = await tx.order.findMany({
    where: { warehouseId, status: "READY_FOR_DISPATCH", shipmentId: null },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
    take: 8,
  });
  const due = await tx.shipment.findFirst({
    where: { warehouseId, direction: "OUTBOUND", status: "PLANNED", scheduledAt: { lte: new Date(now.getTime() + 15 * MIN) } },
    orderBy: { scheduledAt: "asc" },
  });
  if (due || readyUnassigned.length >= 2) {
    const dock = await freeDock();
    const truck = dock ? await freeTruck() : null;
    if (dock && truck) {
      const driver = await tx.employee.findFirst({ where: { warehouseId, role: "DRIVER", shipments: { none: { status: { in: ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"] } } } } });
      let shipmentId = due?.id;
      if (!shipmentId) {
        const dest = readyUnassigned[0]!.customer.city ?? "Philadelphia, PA";
        const map = CITY_MAP[dest] ?? { x: 0.5, y: 0.5 };
        const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { city: true } });
        const created = await tx.shipment.create({
          data: {
            trackingNumber: await nextNumber(tx, "shipment"),
            warehouseId,
            direction: "OUTBOUND",
            status: "PLANNED",
            carrier: CARRIERS[0]!,
            origin: wh.city,
            destination: dest,
            destMapX: map.x,
            destMapY: map.y,
            scheduledAt: now,
            eta: new Date(now.getTime() + 40 * MIN),
            simulated: true,
          },
        });
        shipmentId = created.id;
      }
      const sh = await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: "AT_DOCK", dockId: dock.id, vehicleId: truck.id, driverId: driver?.id ?? null },
      });
      if (readyUnassigned.length) {
        await tx.order.updateMany({ where: { id: { in: readyUnassigned.map((o) => o.id) } }, data: { shipmentId: sh.id } });
      }
      await tx.dock.update({ where: { id: dock.id }, data: { status: "OCCUPIED" } });
      await tx.vehicle.update({
        where: { id: truck.id },
        data: { status: "IN_USE", locationLabel: `${dock.name} (at dock)`, posX: dock.posX + 8, posZ: dock.posZ, heading: -Math.PI / 2 },
      });
      await tx.shipmentEvent.create({ data: { shipmentId: sh.id, status: "AT_DOCK", message: `${truck.code} arrived at ${dock.name}`, location: dock.name, simulated: true } });
      await logActivity(tx, { warehouseId, type: "shipment.at_dock", message: `${truck.code} docked at ${dock.name} for ${sh.trackingNumber}`, entityType: "Shipment", entityId: sh.id, simulated: true });
      events.push(`${truck.code} docked at ${dock.name}`);
    }
  }

  // AT_DOCK → LOADING
  const atDock = await tx.shipment.findMany({ where: { warehouseId, direction: "OUTBOUND", status: "AT_DOCK" } });
  for (const s of atDock) {
    if (!rng.chance(0.6)) continue;
    await tx.shipment.update({ where: { id: s.id }, data: { status: "LOADING" } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "LOADING", message: "Loading started", simulated: true } });
  }

  // LOADING: move staged pallets onto the truck, then mark READY
  const loading = await tx.shipment.findMany({ where: { warehouseId, direction: "OUTBOUND", status: "LOADING" }, include: { dock: true } });
  for (const s of loading) {
    const openLoads = await tx.task.count({ where: { shipmentId: s.id, type: "LOAD", status: { in: ["PENDING", "IN_PROGRESS"] } } });
    if (s.loadingProgress >= 100) {
      if (openLoads === 0) {
        await tx.shipment.update({ where: { id: s.id }, data: { status: "READY" } });
        await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "READY", message: "Loading complete, trailer sealed", simulated: true } });
      }
      continue;
    }
    if (openLoads < 2) {
      const staged = await tx.pallet.findFirst({
        where: { warehouseId, status: "STAGED", location: { zone: { type: "DISPATCH" } }, tasks: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } } },
        orderBy: { updatedAt: "asc" },
      });
      if (staged) {
        await createTask(
          tx,
          { warehouseId, type: "LOAD", description: `Load ${staged.code} onto ${s.trackingNumber}${s.dock ? ` at ${s.dock.name}` : ""}`, palletId: staged.id, fromLocationId: staged.locationId, shipmentId: s.id, priority: "HIGH" },
          SIM,
        );
        continue;
      }
    }
    if (openLoads === 0) {
      // nothing staged: loose cartons are hand-loaded by the dock team
      await tx.shipment.update({ where: { id: s.id }, data: { loadingProgress: Math.min(100, s.loadingProgress + rng.int(6, 12)) } });
    }
  }

  // READY → IN_TRANSIT
  const ready = await tx.shipment.findMany({ where: { warehouseId, direction: "OUTBOUND", status: "READY" }, include: { vehicle: true, dock: true } });
  for (const s of ready) {
    const eta = new Date(now.getTime() + rng.int(6, 14) * MIN);
    await tx.shipment.update({ where: { id: s.id }, data: { status: "IN_TRANSIT", departedAt: now, eta, routeProgress: 0 } });
    if (s.dockId) await tx.dock.update({ where: { id: s.dockId }, data: { status: "AVAILABLE" } });
    if (s.vehicleId) await tx.vehicle.update({ where: { id: s.vehicleId }, data: { onSite: false, locationLabel: `En route to ${s.destination}` } });
    const orders = await tx.order.updateMany({ where: { shipmentId: s.id, status: { in: ["READY_FOR_DISPATCH", "PACKING"] } }, data: { status: "DISPATCHED", dispatchedAt: now } });
    await bumpMetric(tx, warehouseId, { ordersShipped: orders.count });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "IN_TRANSIT", message: `Departed towards ${s.destination}`, location: s.dock?.name, simulated: true } });
    await logActivity(tx, { warehouseId, type: "shipment.departed", message: `${s.vehicle?.code ?? s.carrier} departed ${s.dock?.name ?? "dock"} with ${s.trackingNumber} to ${s.destination}`, entityType: "Shipment", entityId: s.id, simulated: true });
    events.push(`${s.trackingNumber} departed`);
  }

  // IN_TRANSIT / DELAYED: progress along route, maybe delay, deliver
  const moving = await tx.shipment.findMany({ where: { warehouseId, direction: "OUTBOUND", status: { in: ["IN_TRANSIT", "DELAYED"] } }, include: { vehicle: true } });
  for (const s of moving) {
    const departed = (s.departedAt ?? s.createdAt).getTime();
    const progress = Math.min(1, Math.max(0, (now.getTime() - departed) / Math.max(1, s.eta.getTime() - departed)));
    if (progress >= 1) {
      await tx.shipment.update({ where: { id: s.id }, data: { status: "DELIVERED", deliveredAt: now, routeProgress: 1 } });
      await tx.order.updateMany({ where: { shipmentId: s.id, status: "DISPATCHED" }, data: { status: "DELIVERED" } });
      if (s.vehicleId) await tx.vehicle.update({ where: { id: s.vehicleId }, data: { locationLabel: "Returning to base" } });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "DELIVERED", message: "Delivered — proof of delivery captured", location: s.destination, simulated: true } });
      await logActivity(tx, { warehouseId, type: "shipment.delivered", message: `${s.trackingNumber} delivered to ${s.destination}`, entityType: "Shipment", entityId: s.id, simulated: true });
      events.push(`${s.trackingNumber} delivered`);
      continue;
    }
    if (s.status === "IN_TRANSIT" && progress > 0.3 && rng.chance(0.002)) {
      const eta = new Date(s.eta.getTime() + rng.int(8, 15) * MIN);
      await tx.shipment.update({ where: { id: s.id }, data: { status: "DELAYED", eta, routeProgress: progress } });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "DELAYED", message: "Traffic congestion reported on route", location: "En route", simulated: true } });
      await notify(tx, {
        warehouseId,
        category: "SHIPMENT",
        priority: "HIGH",
        title: `Shipment ${s.trackingNumber} delayed`,
        message: `New ETA ${eta.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} to ${s.destination}.`,
        link: `/shipments?id=${s.id}`,
        entityType: "Shipment",
        entityId: s.id,
        dedupeKey: `delayed:${s.id}`,
        simulated: true,
      });
      events.push(`${s.trackingNumber} delayed`);
      continue;
    }
    await tx.shipment.update({ where: { id: s.id }, data: { routeProgress: progress } });
  }
  void layout;
}

async function vehicleReturns({ tx, warehouseId, now, layout }: StepCtx) {
  const away = await tx.vehicle.findMany({
    where: {
      warehouseId,
      type: { in: ["TRUCK", "VAN"] },
      onSite: false,
      status: "IN_USE",
      shipments: { none: { status: { in: ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"] } } },
    },
    include: { shipments: { orderBy: { deliveredAt: "desc" }, take: 1 } },
  });
  if (!away.length) return;
  const onSite = await tx.vehicle.findMany({ where: { warehouseId, type: { in: ["TRUCK", "VAN"] }, onSite: true }, select: { posX: true, posZ: true } });
  for (const v of away) {
    const last = v.shipments[0]?.deliveredAt;
    if (last && now.getTime() - last.getTime() < 2 * MIN) continue;
    const spot = layout.truckParking.find((p) => !onSite.some((o) => Math.hypot(o.posX - p.x, o.posZ - p.z) < 1)) ?? layout.truckParking[0]!;
    onSite.push({ posX: spot.x, posZ: spot.z });
    await tx.vehicle.update({
      where: { id: v.id },
      data: { status: "AVAILABLE", onSite: true, locationLabel: "Truck parking", posX: spot.x, posZ: spot.z, heading: spot.heading, energyLevel: Math.max(30, v.energyLevel - 6) },
    });
    await logActivity(tx, { warehouseId, type: "vehicle.returned", message: `${v.code} returned to base`, entityType: "Vehicle", entityId: v.id, simulated: true });
  }
}

async function inboundFlow({ tx, warehouseId, rng, now, events }: StepCtx) {
  // Arrivals → dock
  const arriving = await tx.shipment.findMany({
    where: {
      warehouseId,
      direction: "INBOUND",
      OR: [
        { status: "IN_TRANSIT", eta: { lte: now } },
        { status: "DELAYED", eta: { lte: now } },
        { status: "PLANNED", scheduledAt: { lte: now } },
      ],
    },
    orderBy: { eta: "asc" },
    take: 1,
  });
  for (const s of arriving) {
    const dock = await tx.dock.findFirst({ where: { warehouseId, direction: "INBOUND", status: "AVAILABLE" }, orderBy: { code: "asc" } });
    if (!dock) break;
    await tx.shipment.update({ where: { id: s.id }, data: { status: "AT_DOCK", dockId: dock.id, routeProgress: 1 } });
    await tx.dock.update({ where: { id: dock.id }, data: { status: "OCCUPIED" } });
    await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "AT_DOCK", message: `${s.carrier} trailer arrived at ${dock.name}`, location: dock.name, simulated: true } });
    await logActivity(tx, { warehouseId, type: "shipment.arrived", message: `Inbound ${s.trackingNumber} (${s.carrier}) arrived at ${dock.name}`, entityType: "Shipment", entityId: s.id, simulated: true });
    events.push(`${s.trackingNumber} arrived`);
  }

  // AT_DOCK → unloading
  await tx.shipment.updateMany({ where: { warehouseId, direction: "INBOUND", status: "AT_DOCK", updatedAt: { lt: new Date(now.getTime() - 3000) } }, data: { status: "LOADING" } });

  // Unloading: create pallets and UNLOAD tasks to receiving
  const unloading = await tx.shipment.findMany({ where: { warehouseId, direction: "INBOUND", status: "LOADING" }, include: { dock: true } });
  for (const s of unloading) {
    const created = await tx.task.count({ where: { shipmentId: s.id, type: "UNLOAD", status: { not: "CANCELLED" } } });
    const open = await tx.task.count({ where: { shipmentId: s.id, type: "UNLOAD", status: { in: ["PENDING", "IN_PROGRESS"] } } });
    const preUnloaded = Math.round((s.loadingProgress / 100) * s.palletCount) - created; // seed progress before sim
    const done = created + Math.max(0, preUnloaded);
    if (done >= s.palletCount) {
      if (open === 0) {
        await tx.shipment.update({ where: { id: s.id }, data: { status: "DELIVERED", deliveredAt: now, loadingProgress: 100 } });
        if (s.dockId) await tx.dock.update({ where: { id: s.dockId }, data: { status: "AVAILABLE" } });
        await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "DELIVERED", message: "Received in full", location: s.dock?.name, simulated: true } });
        await logActivity(tx, { warehouseId, type: "shipment.received", message: `Inbound ${s.trackingNumber} received in full`, entityType: "Shipment", entityId: s.id, simulated: true });
        events.push(`${s.trackingNumber} received`);
      }
      continue;
    }
    if (open >= 2) continue;
    const slot = await findFreeLocation(tx, warehouseId, { zoneTypes: ["RECEIVING"], types: ["FLOOR"] });
    if (!slot) continue;
    // Prefer restocking products that are below their reorder level
    const low = await tx.$queryRaw<{ productId: string }[]>`
      SELECT p.id AS "productId" FROM "Product" p
      LEFT JOIN "InventoryItem" i ON i."productId" = p.id AND i."warehouseId" = ${warehouseId}
      WHERE p."isActive" = true
      GROUP BY p.id, p."reorderLevel"
      HAVING COALESCE(SUM(i.quantity - i.reserved), 0) < p."reorderLevel"
      ORDER BY p.id LIMIT 10`;
    const product = low.length && rng.chance(0.6)
      ? await tx.product.findUnique({ where: { id: rng.pick(low).productId } })
      : await tx.product.findFirst({ where: { isActive: true }, skip: rng.int(0, 40), orderBy: { sku: "asc" } });
    if (!product) continue;
    const qty = Math.max(6, Math.round(Math.max(product.reorderQty / 2, 24) * rng.float(0.6, 1)));
    const pallet = await tx.pallet.create({
      data: {
        code: await nextNumber(tx, "pallet"),
        warehouseId,
        productId: product.id,
        quantity: qty,
        lot: `L${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${rng.int(100, 999)}`,
        status: "IN_TRANSIT",
        grossWeightKg: Math.round((qty * product.unitWeightKg + 22) * 10) / 10,
        receivedAt: now,
      },
    });
    await createTask(
      tx,
      { warehouseId, type: "UNLOAD", description: `Unload ${pallet.code} (${product.name}) from ${s.trackingNumber} to ${slot.code}`, palletId: pallet.id, toLocationId: slot.id, shipmentId: s.id, priority: "HIGH" },
      SIM,
    );
    const progress = Math.min(99, Math.round(((done + 1) / s.palletCount) * 100));
    await tx.shipment.update({ where: { id: s.id }, data: { loadingProgress: progress } });
    await bumpMetric(tx, warehouseId, { unitsReceived: qty });
  }

  // Occasionally schedule a new inbound trailer
  const active = await tx.shipment.count({ where: { warehouseId, direction: "INBOUND", status: { in: ["PLANNED", "IN_TRANSIT", "AT_DOCK", "LOADING", "DELAYED"] } } });
  if (active < 3 && rng.chance(0.1)) {
    const origins = Object.keys(CITY_MAP);
    const origin = rng.pick(origins);
    const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { city: true } });
    if (origin !== wh.city) {
      const map = CITY_MAP[origin]!;
      const s = await tx.shipment.create({
        data: {
          trackingNumber: await nextNumber(tx, "shipment"),
          warehouseId,
          direction: "INBOUND",
          status: "IN_TRANSIT",
          carrier: rng.pick(CARRIERS.slice(1)),
          origin,
          destination: wh.city,
          destMapX: map.x,
          destMapY: map.y,
          palletCount: rng.int(3, 6),
          weightKg: rng.int(1800, 6400),
          scheduledAt: now,
          departedAt: new Date(now.getTime() - rng.int(40, 120) * MIN),
          eta: new Date(now.getTime() + rng.int(4, 10) * MIN),
          simulated: true,
        },
      });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "IN_TRANSIT", message: `Inbound from ${origin} scheduled`, location: origin, simulated: true } });
      events.push(`Inbound ${s.trackingNumber} scheduled`);
    }
  }
}

async function startPendingTasks({ tx, warehouseId, events }: StepCtx) {
  const pending = await tx.task.findMany({
    where: { warehouseId, status: "PENDING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 6,
  });
  let started = 0;
  let forkliftsExhausted = false;
  for (const t of pending) {
    if (started >= 4) break;
    const needsLift = FORKLIFT_TASKS.includes(t.type);
    if (needsLift && forkliftsExhausted) continue;
    try {
      await startTask(tx, t.id, {}, SIM);
      started++;
      events.push(`${t.number} started`);
    } catch {
      if (needsLift) forkliftsExhausted = true;
    }
  }
}

async function alerts({ tx, warehouseId, tick, now }: StepCtx) {
  if (tick % 5 !== 0) return;
  const day = now.toISOString().slice(0, 10);
  const low = await tx.$queryRaw<{ id: string; name: string; sku: string; reorderLevel: number; available: bigint }[]>`
    SELECT p.id, p.name, p.sku, p."reorderLevel", COALESCE(SUM(i.quantity - i.reserved), 0) AS available
    FROM "Product" p
    LEFT JOIN "InventoryItem" i ON i."productId" = p.id AND i."warehouseId" = ${warehouseId}
    WHERE p."isActive" = true
    GROUP BY p.id
    HAVING COALESCE(SUM(i.quantity - i.reserved), 0) < p."reorderLevel"
    LIMIT 20`;
  for (const p of low) {
    await notify(tx, {
      warehouseId,
      category: "INVENTORY",
      priority: Number(p.available) === 0 ? "CRITICAL" : "MEDIUM",
      title: `Low stock: ${p.name}`,
      message: `${p.sku} has ${Number(p.available)} available units (reorder level ${p.reorderLevel}).`,
      link: `/inventory?product=${p.id}`,
      entityType: "Product",
      entityId: p.id,
      dedupeKey: `low-stock:${p.id}:${day}`,
      simulated: true,
    });
  }
  const wh = await tx.warehouse.findUnique({ where: { id: warehouseId }, select: { settings: true } });
  const threshold = Number((wh?.settings as { capacityWarningPct?: number })?.capacityWarningPct ?? 90);
  const zones = await tx.zone.findMany({
    where: { warehouseId },
    include: { _count: { select: { locations: true } }, locations: { where: { pallet: { isNot: null } }, select: { id: true } } },
  });
  for (const z of zones) {
    const cap = z._count.locations;
    if (!cap) continue;
    const pct = (z.locations.length / cap) * 100;
    if (pct >= threshold) {
      await notify(tx, {
        warehouseId,
        category: "CAPACITY",
        priority: pct >= 98 ? "HIGH" : "MEDIUM",
        title: `${z.name} at ${Math.round(pct)}% capacity`,
        message: `${z.locations.length} of ${cap} positions are occupied. Consider re-slotting or releasing stock.`,
        link: `/zones?id=${z.id}`,
        entityType: "Zone",
        entityId: z.id,
        dedupeKey: `capacity:${z.id}:${day}`,
        simulated: true,
      });
    }
  }
  const overdue = await tx.order.findMany({ where: { warehouseId, status: "PENDING", requiredDispatchAt: { lt: now } }, take: 5 });
  for (const o of overdue) {
    await notify(tx, {
      warehouseId,
      category: "ORDER",
      priority: "HIGH",
      title: `Order ${o.number} awaiting processing`,
      message: "Required dispatch time has passed and the order has not been released for picking.",
      link: `/orders?id=${o.id}`,
      entityType: "Order",
      entityId: o.id,
      dedupeKey: `overdue:${o.id}`,
      simulated: true,
    });
  }
  const lowBattery = await tx.vehicle.findMany({ where: { warehouseId, energyLevel: { lt: 20 }, type: { in: ["FORKLIFT", "REACH_TRUCK"] } } });
  for (const v of lowBattery) {
    await notify(tx, {
      warehouseId,
      category: "FLEET",
      priority: "LOW",
      title: `${v.code} battery low (${v.energyLevel}%)`,
      message: `${v.code} has been sent to the charging bay.`,
      link: `/fleet?id=${v.id}`,
      entityType: "Vehicle",
      entityId: v.id,
      dedupeKey: `battery:${v.id}:${day}`,
      simulated: true,
    });
  }
}

/** Keeps today's MetricSnapshot current so dashboards update in real time. */
async function metrics({ tx, warehouseId, tick }: StepCtx) {
  await ensureTodaySnapshot(tx, warehouseId);
  if (tick % 3 !== 0) return;
  // sequential on purpose: a transaction client runs one query at a time
  const inv = await tx.inventoryItem.aggregate({ where: { warehouseId }, _sum: { quantity: true } });
  const backlog = await tx.order.count({ where: { warehouseId, status: { in: ["PENDING", "PROCESSING", "PICKING", "PACKING"] } } });
  const trucks = await tx.vehicle.count({ where: { warehouseId, type: "TRUCK", onSite: true } });
  const ops = await tx.task.count({ where: { warehouseId, status: "IN_PROGRESS" } });
  const occupied = await tx.storageLocation.count({ where: { warehouseId, pallet: { isNot: null } } });
  const capacity = await tx.storageLocation.count({ where: { warehouseId } });
  const inbound = await tx.shipment.count({ where: { warehouseId, direction: "INBOUND", status: { in: ["AT_DOCK", "LOADING"] } } });
  await tx.metricSnapshot.update({
    where: { warehouseId_date: { warehouseId, date: todayUtc() } },
    data: {
      unitsOnHand: inv._sum.quantity ?? 0,
      ordersBacklog: backlog,
      trucksOnSite: trucks + inbound,
      activeOperations: ops,
      utilization: capacity ? Math.round((occupied / capacity) * 1000) / 10 : 0,
    },
  });
}

// ───────────────────────────── helpers ─────────────────────────────

export function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Creates today's metrics row, pro-rated from yesterday so charts stay continuous. */
export async function ensureTodaySnapshot(tx: Tx | Db, warehouseId: string, now = new Date()) {
  const date = todayUtc(now);
  const existing = await tx.metricSnapshot.findUnique({ where: { warehouseId_date: { warehouseId, date } } });
  if (existing) return existing;
  const prev = await tx.metricSnapshot.findFirst({ where: { warehouseId, date: { lt: date } }, orderBy: { date: "desc" } });
  const elapsed = (now.getTime() - date.getTime()) / 86_400_000;
  const f = Math.min(1, Math.max(0.05, elapsed));
  const base: Prisma.MetricSnapshotUncheckedCreateInput = {
    warehouseId,
    date,
    ordersReceived: Math.round((prev?.ordersReceived ?? 150) * f),
    ordersShipped: Math.round((prev?.ordersShipped ?? 145) * f),
    unitsPicked: Math.round((prev?.unitsPicked ?? 2000) * f),
    unitsReceived: Math.round((prev?.unitsReceived ?? 2000) * f),
    pickAccuracy: prev?.pickAccuracy ?? 99.2,
    utilization: prev?.utilization ?? 75,
    onTimeRate: prev?.onTimeRate ?? 96,
    inventoryValue: prev?.inventoryValue ?? 2_000_000,
    operatingCost: Math.round((prev?.operatingCost ?? 12_000) * f),
    laborHours: Math.round((prev?.laborHours ?? 200) * f),
    avgDockMinutes: prev?.avgDockMinutes ?? 42,
    inventoryTurnover: prev?.inventoryTurnover ?? 8.4,
    unitsOnHand: prev?.unitsOnHand ?? 0,
    ordersBacklog: prev?.ordersBacklog ?? 0,
    trucksOnSite: prev?.trucksOnSite ?? 0,
    activeOperations: prev?.activeOperations ?? 0,
    inventoryAccuracy: prev?.inventoryAccuracy ?? 99.4,
    simulated: true,
  };
  return tx.metricSnapshot.upsert({ where: { warehouseId_date: { warehouseId, date } }, create: base, update: {} });
}

async function bumpMetric(
  tx: Tx,
  warehouseId: string,
  inc: Partial<Record<"ordersReceived" | "ordersShipped" | "unitsPicked" | "unitsReceived", number>>,
) {
  await ensureTodaySnapshot(tx, warehouseId);
  const data: Prisma.MetricSnapshotUpdateInput = {};
  for (const [k, v] of Object.entries(inc)) if (v) (data as Record<string, unknown>)[k] = { increment: v };
  await tx.metricSnapshot.update({ where: { warehouseId_date: { warehouseId, date: todayUtc() } }, data });
}
