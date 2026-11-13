import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { maybeAdvance, runTick } from "@/server/simulation/engine";
import { getScene } from "@/server/services/scene";
import { getDashboard } from "@/server/services/dashboard";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as dashboardRoute } from "@/app/api/dashboard/route";
import { GET as sceneRoute } from "@/app/api/scene/route";
import { POST as ordersPost } from "@/app/api/orders/route";
import { POST as orderStatus } from "@/app/api/orders/[id]/status/route";
import { GET as orderGet } from "@/app/api/orders/[id]/route";
import { POST as palletMove } from "@/app/api/pallets/[id]/move/route";
import { GET as notificationsCount } from "@/app/api/notifications/count/route";
import { POST as readAll } from "@/app/api/notifications/read-all/route";
import { PATCH as simulationPatch } from "@/app/api/simulation/route";
import { TEST_PASSWORD, call, mainWarehouse, resetDatabase } from "../helpers";

let warehouseId: string;

beforeAll(async () => {
  await resetDatabase();
  warehouseId = (await mainWarehouse()).id;
});

async function invariants() {
  const negatives = await db.inventoryItem.count({ where: { OR: [{ quantity: { lt: 0 } }, { damaged: { lt: 0 } }, { reserved: { lt: 0 } }] } });
  expect(negatives).toBe(0);
  const overReserved = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "InventoryItem" WHERE reserved > quantity`;
  expect(overReserved[0]!.n).toBe(0);
  const busyLifts = await db.vehicle.findMany({ where: { warehouseId, type: { in: ["FORKLIFT", "REACH_TRUCK"] }, status: "IN_USE" }, include: { tasks: { where: { status: "IN_PROGRESS" } } } });
  for (const v of busyLifts) expect(v.tasks.length).toBeLessThanOrEqual(1);
  const occupiedDocks = await db.dock.findMany({ where: { warehouseId, status: "OCCUPIED" } });
  for (const d of occupiedDocks) {
    expect(await db.shipment.count({ where: { dockId: d.id, status: { in: ["AT_DOCK", "LOADING", "READY"] } } })).toBeGreaterThan(0);
  }
}

describe("simulation engine", () => {
  it("runs many ticks while keeping stock and resources consistent", async () => {
    let now = Date.now();
    const events: string[] = [];
    for (let t = 1; t <= 40; t++) {
      now += 4000;
      events.push(...(await runTick(db, warehouseId, t, 1234, new Date(now))));
    }
    expect(events.length).toBeGreaterThan(10);
    await invariants();
    expect(await db.task.count({ where: { warehouseId, simulated: true, status: "COMPLETED" } })).toBeGreaterThan(0);
    expect(await db.activityEvent.count({ where: { warehouseId, simulated: true } })).toBeGreaterThan(0);
  });

  it("advances at most once per interval, even with concurrent pollers", async () => {
    await db.simulationState.update({ where: { warehouseId }, data: { running: true, lastTickAt: new Date(Date.now() - 60_000) } });
    const before = (await db.simulationState.findUniqueOrThrow({ where: { warehouseId } })).tick;
    const results = await Promise.all([maybeAdvance(db, warehouseId), maybeAdvance(db, warehouseId), maybeAdvance(db, warehouseId)]);
    expect(results.filter((r) => r.advanced)).toHaveLength(1);
    expect((await db.simulationState.findUniqueOrThrow({ where: { warehouseId } })).tick).toBe(before + 1);
    // immediately polling again does nothing
    expect((await maybeAdvance(db, warehouseId)).advanced).toBe(false);
  });

  it("does nothing while paused", async () => {
    await db.simulationState.update({ where: { warehouseId }, data: { running: false, lastTickAt: new Date(0) } });
    expect((await maybeAdvance(db, warehouseId)).advanced).toBe(false);
  });

  it("produces a consistent 3D scene and dashboard", async () => {
    const scene = await getScene(db, warehouseId);
    expect(scene.racks.length).toBeGreaterThan(0);
    const codes = new Set(scene.pallets.map((p) => p.locationId));
    expect(codes.size).toBe(scene.pallets.length); // one pallet per location
    for (const v of scene.vehicles.filter((x) => x.task)) {
      expect(v.task!.route.length).toBeGreaterThanOrEqual(2);
      expect(v.task!.pickupT).toBeGreaterThanOrEqual(0);
      expect(v.task!.pickupT).toBeLessThanOrEqual(1);
    }
    const dash = await getDashboard(db, warehouseId);
    expect(dash.kpis.map((k) => k.key)).toEqual(["stock", "operations", "trucks", "backlog", "ontime", "utilization", "accuracy", "throughput"]);
    for (const k of dash.kpis) expect(Number.isFinite(k.value)).toBe(true);
  });
});

describe("critical user journey (API level)", () => {
  it("operator signs in, inspects the warehouse, moves a pallet and works an order", async () => {
    // sign in as the operator
    const login = await call(loginRoute, "/api/auth/login", { method: "POST", body: { email: "operator@waretrack.demo", password: TEST_PASSWORD }, headers: { "x-forwarded-for": "10.2.2.2" } });
    expect(login.status).toBe(200);
    const token = /wt_session=([^;]+)/.exec(login.headers.get("set-cookie")!)![1]!;
    const opts = { token, warehouseId };

    // dashboard + 3D scene load
    expect((await call(dashboardRoute, "/api/dashboard", opts)).status).toBe(200);
    const scene = await call(sceneRoute, "/api/scene", opts);
    expect(scene.status).toBe(200);
    const pallets = (scene.json.data as { pallets: { id: string; status: string; locationType: string }[] }).pallets;
    const pallet = pallets.find((p) => p.status === "STORED" && p.locationType === "RACK")!;

    // move a pallet via a forklift task
    const free = await db.storageLocation.findFirstOrThrow({ where: { warehouseId, type: "RACK", pallet: { is: null }, tasksTo: { none: {} }, zone: { code: "STB" } } });
    const move = await call(palletMove, `/api/pallets/${pallet.id}/move`, { ...opts, method: "POST", body: { toLocationId: free.id, mode: "task" } }, { id: pallet.id });
    expect(move.status).toBe(200);
    expect((move.json.data as { task: { number: string } }).task.number).toMatch(/^TSK-/);

    // operators may update order status but not create orders
    const customer = await db.customer.findFirstOrThrow();
    const product = await db.inventoryItem.findFirstOrThrow({ where: { warehouseId, quantity: { gt: 50 }, reserved: 0, zone: { type: "PICKING" } } });
    const create = await call(ordersPost, "/api/orders", {
      ...opts,
      method: "POST",
      body: { customerId: customer.id, requiredDispatchAt: new Date(Date.now() + 86_400_000).toISOString(), items: [{ productId: product.productId, quantity: 2 }] },
    });
    expect(create.status).toBe(403);

    const pending = await db.order.findFirstOrThrow({ where: { warehouseId, status: "PENDING", items: { every: { quantity: { lt: 30 } } } } });
    const release = await call(orderStatus, `/api/orders/${pending.id}/status`, { ...opts, method: "POST", body: { status: "PROCESSING" } }, { id: pending.id });
    expect([200, 409]).toContain(release.status); // 409 when seeded stock is short — both are handled responses
    const detail = await call(orderGet, `/api/orders/${pending.id}`, opts, { id: pending.id });
    expect(detail.status).toBe(200);

    // notifications
    const count = await call(notificationsCount, "/api/notifications/count", opts);
    expect((count.json.data as { unread: number }).unread).toBeGreaterThan(0);
    expect((await call(readAll, "/api/notifications/read-all", { ...opts, method: "POST" })).status).toBe(200);
    expect(((await call(notificationsCount, "/api/notifications/count", opts)).json.data as { unread: number }).unread).toBe(0);

    // operators cannot control the simulation
    expect((await call(simulationPatch, "/api/simulation", { ...opts, method: "PATCH", body: { running: true } })).status).toBe(403);
  });
});
