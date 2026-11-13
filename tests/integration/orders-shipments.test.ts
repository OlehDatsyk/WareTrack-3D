import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changeOrderStatus, createOrder } from "@/server/services/orders";
import { changeShipmentStatus, createShipment } from "@/server/services/shipments";
import { assignShipmentToDock } from "@/server/services/facility";
import { actor, mainWarehouse, resetDatabase } from "../helpers";

let warehouseId: string;
let managerId: string;

beforeAll(async () => {
  await resetDatabase();
  warehouseId = (await mainWarehouse()).id;
  managerId = (await db.user.findFirstOrThrow({ where: { role: "MANAGER" } })).id;
  // keep the simulation out of the way
  await db.simulationState.updateMany({ data: { running: false } });
});

async function totals(productId: string) {
  const a = await db.inventoryItem.aggregate({ where: { warehouseId, productId }, _sum: { quantity: true, reserved: true } });
  return { quantity: a._sum.quantity ?? 0, reserved: a._sum.reserved ?? 0 };
}

async function stockedProduct(min = 200) {
  const item = await db.inventoryItem.findFirstOrThrow({
    where: { warehouseId, quantity: { gt: min }, reserved: 0, zone: { type: "PICKING" } },
    orderBy: { quantity: "desc" },
  });
  return item.productId;
}

describe("order workflow", () => {
  it("runs an order from creation to delivery with correct stock effects", async () => {
    const productId = await stockedProduct(20);
    const customer = await db.customer.findFirstOrThrow();
    const order = await createOrder(
      db,
      warehouseId,
      { customerId: customer.id, priority: "HIGH", requiredDispatchAt: new Date(Date.now() + 86_400_000), items: [{ productId, quantity: 7 }] },
      actor(managerId),
    );
    expect(order.status).toBe("PENDING");
    expect(order.number).toMatch(/^SO-\d+$/);
    const t0 = await totals(productId);

    await changeOrderStatus(db, warehouseId, order.id, "PROCESSING", actor(managerId));
    const t1 = await totals(productId);
    expect(t1.reserved).toBe(t0.reserved + 7);
    expect(t1.quantity).toBe(t0.quantity);

    await changeOrderStatus(db, warehouseId, order.id, "PICKING", actor(managerId));
    expect(await db.task.count({ where: { orderId: order.id, type: "PICK", status: "PENDING" } })).toBe(1);

    await changeOrderStatus(db, warehouseId, order.id, "PACKING", actor(managerId));
    const t2 = await totals(productId);
    expect(t2.quantity).toBe(t0.quantity - 7);
    expect(t2.reserved).toBe(t0.reserved);
    expect((await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).pickedQty).toBe(7);

    await changeOrderStatus(db, warehouseId, order.id, "READY_FOR_DISPATCH", actor(managerId));
    expect(await db.pallet.count({ where: { lot: order.number, status: "STAGED" } })).toBe(1);

    // ship it
    const truck = await db.vehicle.findFirstOrThrow({ where: { warehouseId, type: "TRUCK", status: "AVAILABLE", onSite: true } });
    const shipment = await createShipment(
      db,
      warehouseId,
      { direction: "OUTBOUND", carrier: "WareTrack Freight", counterpart: "Boston, MA", scheduledAt: new Date(), eta: new Date(Date.now() + 3_600_000), palletCount: 1, weightKg: 100, vehicleId: truck.id, orderIds: [order.id] },
      actor(managerId),
    );
    const dock = await db.dock.findFirstOrThrow({ where: { warehouseId, direction: "OUTBOUND", status: "AVAILABLE" } });
    await assignShipmentToDock(db, warehouseId, shipment.id, { dockId: dock.id, vehicleId: truck.id }, actor(managerId));
    expect((await db.dock.findUniqueOrThrow({ where: { id: dock.id } })).status).toBe("OCCUPIED");

    // orders cannot be marked dispatched while their shipment is still at the dock
    await expect(changeOrderStatus(db, warehouseId, order.id, "DISPATCHED", actor(managerId))).rejects.toMatchObject({ status: 400 });

    for (const s of ["LOADING", "READY", "IN_TRANSIT"] as const) await changeShipmentStatus(db, warehouseId, shipment.id, { status: s }, actor(managerId));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DISPATCHED");
    expect((await db.dock.findUniqueOrThrow({ where: { id: dock.id } })).status).toBe("AVAILABLE");
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: truck.id } })).onSite).toBe(false);

    await changeShipmentStatus(db, warehouseId, shipment.id, { status: "DELIVERED" }, actor(managerId));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DELIVERED");
    const events = await db.shipmentEvent.findMany({ where: { shipmentId: shipment.id } });
    expect(events.map((e) => e.status)).toEqual(expect.arrayContaining(["PLANNED", "AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELIVERED"]));
  });

  it("rejects invalid transitions", async () => {
    const delivered = await db.order.findFirstOrThrow({ where: { warehouseId, status: "DELIVERED" } });
    await expect(changeOrderStatus(db, warehouseId, delivered.id, "CANCELLED", actor(managerId))).rejects.toMatchObject({ status: 400 });
    const pending = await db.order.findFirstOrThrow({ where: { warehouseId, status: "PENDING" } });
    await expect(changeOrderStatus(db, warehouseId, pending.id, "DISPATCHED", actor(managerId))).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to release an order without enough stock", async () => {
    const customer = await db.customer.findFirstOrThrow();
    const product = await db.product.findFirstOrThrow({ where: { sku: "ELC-TAB-10" } }); // seeded low-stock item
    const order = await createOrder(
      db,
      warehouseId,
      { customerId: customer.id, priority: "NORMAL", requiredDispatchAt: new Date(Date.now() + 86_400_000), items: [{ productId: product.id, quantity: 5000 }] },
      actor(managerId),
    );
    await expect(changeOrderStatus(db, warehouseId, order.id, "PROCESSING", actor(managerId))).rejects.toMatchObject({ status: 409 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("releases reservations and returns picked units when cancelled", async () => {
    const productId = await stockedProduct(20);
    const customer = await db.customer.findFirstOrThrow();
    const order = await createOrder(
      db,
      warehouseId,
      { customerId: customer.id, priority: "NORMAL", requiredDispatchAt: new Date(Date.now() + 86_400_000), items: [{ productId, quantity: 4 }] },
      actor(managerId),
    );
    const before = await totals(productId);
    await changeOrderStatus(db, warehouseId, order.id, "PROCESSING", actor(managerId));
    await changeOrderStatus(db, warehouseId, order.id, "PICKING", actor(managerId));
    await changeOrderStatus(db, warehouseId, order.id, "CANCELLED", actor(managerId));
    const after = await totals(productId);
    expect(after).toEqual(before);
    expect(await db.task.count({ where: { orderId: order.id, status: { in: ["PENDING", "IN_PROGRESS"] } } })).toBe(0);
  });
});

describe("dock assignment rules", () => {
  it("rejects a dock for the wrong direction and busy docks", async () => {
    const inbound = await db.shipment.findFirstOrThrow({ where: { warehouseId, direction: "INBOUND", status: "PLANNED" } });
    const outboundDock = await db.dock.findFirstOrThrow({ where: { warehouseId, direction: "OUTBOUND" } });
    await expect(assignShipmentToDock(db, warehouseId, inbound.id, { dockId: outboundDock.id }, actor(managerId))).rejects.toMatchObject({ status: 400 });
    const busy = await db.dock.findFirstOrThrow({ where: { warehouseId, direction: "INBOUND", status: { not: "AVAILABLE" } } });
    await expect(assignShipmentToDock(db, warehouseId, inbound.id, { dockId: busy.id }, actor(managerId))).rejects.toMatchObject({ status: 409 });
  });

  it("frees the dock and truck when a shipment is cancelled", async () => {
    const atDock = await db.shipment.findFirstOrThrow({ where: { warehouseId, direction: "OUTBOUND", status: "AT_DOCK" } });
    await changeShipmentStatus(db, warehouseId, atDock.id, { status: "CANCELLED" }, actor(managerId));
    expect((await db.dock.findUniqueOrThrow({ where: { id: atDock.dockId! } })).status).toBe("AVAILABLE");
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: atDock.vehicleId! } })).status).toBe("AVAILABLE");
    expect(await db.order.count({ where: { shipmentId: atDock.id } })).toBe(0);
  });
});
