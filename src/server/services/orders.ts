import type { Db, Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import { canTransitionOrder } from "@/lib/workflows";
import type { OrderQuery } from "@/schemas/orders";
import { completeTask, createTask, findFreeLocation, nextNumber, type Actor } from "./operations";
import { adjustZoneStock, availableStock, consumeStock, releaseReservation, reserveStock } from "./stock";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;

export async function listOrders(db: Db, warehouseId: string, q: OrderQuery) {
  const where: Prisma.OrderWhereInput = {
    warehouseId,
    ...(q.status ? { status: q.status } : q.open ? { status: { notIn: ["DELIVERED", "CANCELLED"] } } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.q
      ? { OR: [{ number: { contains: q.q, mode: "insensitive" } }, { customer: { name: { contains: q.q, mode: "insensitive" } } }] }
      : {}),
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    q.sort === "priority" ? [{ priority: q.dir === "asc" ? "desc" : "asc" }, { createdAt: "desc" }] : [{ [q.sort]: q.dir }];
  const [items, total, counts] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, city: true } },
        items: { select: { quantity: true, pickedQty: true } },
        shipment: { select: { id: true, trackingNumber: true, status: true } },
      },
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: { warehouseId }, _count: { _all: true } }),
  ]);
  return {
    total,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>,
    items: items.map((o) => {
      const units = o.items.reduce((s, i) => s + i.quantity, 0);
      const picked = o.items.reduce((s, i) => s + i.pickedQty, 0);
      return {
        id: o.id,
        number: o.number,
        status: o.status,
        priority: o.priority,
        customer: o.customer,
        lines: o.items.length,
        units,
        pickedPct: units ? Math.round((picked / units) * 100) : 0,
        createdAt: o.createdAt,
        requiredDispatchAt: o.requiredDispatchAt,
        overdue: !["DISPATCHED", "DELIVERED", "CANCELLED"].includes(o.status) && o.requiredDispatchAt < new Date(),
        shipment: o.shipment,
        simulated: o.simulated,
      };
    }),
  };
}

export async function getOrder(db: Db, warehouseId: string, id: string) {
  const order = await db.order.findFirst({
    where: { id, warehouseId },
    include: {
      customer: true,
      items: { include: { product: { select: { id: true, sku: true, name: true, unit: true, unitCost: true } } } },
      tasks: { orderBy: { createdAt: "desc" }, include: { assignee: { select: { firstName: true, lastName: true } } } },
      shipment: { include: { vehicle: { select: { code: true } }, dock: { select: { name: true } } } },
    },
  });
  if (!order) throw notFound("Order");
  const [activity, audits] = await Promise.all([
    db.activityEvent.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.auditLog.findMany({ where: { entityType: "Order", entityId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } } } }),
  ]);
  const availability = await Promise.all(order.items.map((i) => availableStock(db as unknown as Tx, warehouseId, i.productId)));
  return {
    ...order,
    items: order.items.map((i, idx) => ({ ...i, product: { ...i.product, unitCost: Number(i.product.unitCost) }, available: availability[idx]! })),
    value: order.items.reduce((s, i) => s + i.quantity * Number(i.product.unitCost), 0),
    timeline: [
      ...activity.map((a) => ({ id: a.id, at: a.createdAt, text: a.message, actor: a.actorName, simulated: a.simulated })),
      ...audits
        .filter((a) => a.action !== "order.status")
        .map((a) => ({ id: a.id, at: a.createdAt, text: a.action.replace("order.", "Order ").replace("_", " "), actor: a.user?.name ?? null, simulated: false })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()),
  };
}

async function validateItems(tx: Tx | Db, items: { productId: string; quantity: number }[]) {
  const products = await tx.product.findMany({ where: { id: { in: items.map((i) => i.productId) } }, select: { id: true, isActive: true, sku: true } });
  for (const i of items) {
    const p = products.find((x) => x.id === i.productId);
    if (!p) throw badRequest("One of the products no longer exists");
    if (!p.isActive) throw badRequest(`${p.sku} is archived and cannot be ordered`);
  }
}

export async function createOrder(
  db: Db,
  warehouseId: string,
  input: { customerId: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; requiredDispatchAt: Date; notes?: string | null; items: { productId: string; quantity: number }[] },
  actor: UserActor,
) {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw badRequest("Customer not found");
  await validateItems(db, input.items);
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        number: await nextNumber(tx, "order"),
        warehouseId,
        customerId: input.customerId,
        priority: input.priority,
        requiredDispatchAt: input.requiredDispatchAt,
        notes: input.notes ?? null,
        items: { create: input.items },
      },
    });
    await audit(tx, { userId: actor.userId, action: "order.create", entityType: "Order", entityId: order.id, details: { number: order.number, lines: input.items.length }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "order.created", message: `Order ${order.number} created for ${customer.name}`, entityType: "Order", entityId: order.id, actorName: actor.name });
    return order;
  });
}

export async function updateOrder(
  db: Db,
  warehouseId: string,
  id: string,
  input: { priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; requiredDispatchAt?: Date; notes?: string | null; items?: { productId: string; quantity: number }[] },
  actor: UserActor,
) {
  const order = await db.order.findFirst({ where: { id, warehouseId } });
  if (!order) throw notFound("Order");
  if (order.status === "DELIVERED" || order.status === "CANCELLED") throw badRequest("Closed orders cannot be edited");
  if (input.items && order.status !== "PENDING") throw badRequest("Order lines can only be changed while the order is pending");
  if (input.items) await validateItems(db, input.items);
  return db.$transaction(async (tx) => {
    if (input.items) {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({ data: input.items.map((i) => ({ ...i, orderId: id })) });
    }
    const updated = await tx.order.update({
      where: { id },
      data: { priority: input.priority, requiredDispatchAt: input.requiredDispatchAt, notes: input.notes },
    });
    await audit(tx, { userId: actor.userId, action: "order.update", entityType: "Order", entityId: id, details: { fields: Object.keys(input) }, ip: actor.ip });
    return updated;
  });
}

/** Applies a status change with all of its stock/task side effects. */
export async function changeOrderStatus(db: Db, warehouseId: string, id: string, to: OrderStatus, actor: UserActor, note?: string) {
  return db.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, warehouseId },
        include: { items: { include: { product: true } }, shipment: true, tasks: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } } } },
      });
      if (!order) throw notFound("Order");
      const from = order.status;
      if (!canTransitionOrder(from, to)) throw badRequest(`Cannot move an order from ${from.toLowerCase().replace(/_/g, " ")} to ${to.toLowerCase().replace(/_/g, " ")}`);

      const remaining = (i: (typeof order.items)[number]) => i.quantity - i.pickedQty;

      if (to === "PROCESSING") {
        const shortages: string[] = [];
        for (const i of order.items) {
          const avail = await availableStock(tx, warehouseId, i.productId);
          if (avail < remaining(i)) shortages.push(`${i.product.sku} (need ${remaining(i)}, available ${Math.max(0, avail)})`);
        }
        if (shortages.length) throw conflict(`Insufficient stock: ${shortages.join("; ")}`);
        for (const i of order.items) await reserveStock(tx, { warehouseId, productId: i.productId, qty: remaining(i) });
      }
      if (from === "PROCESSING" && to === "PENDING") {
        for (const i of order.items) await releaseReservation(tx, { warehouseId, productId: i.productId, qty: remaining(i) });
      }
      if (to === "PICKING" && !order.tasks.some((t) => t.type === "PICK")) {
        const units = order.items.reduce((s, i) => s + remaining(i), 0);
        await createTask(tx, { warehouseId, type: "PICK", description: `Pick ${units} units for ${order.number}`, orderId: order.id, priority: order.priority }, actor);
      }
      if (to === "PACKING") {
        const pick = order.tasks.find((t) => t.type === "PICK");
        if (pick) {
          await completeTask(tx, pick.id, actor); // consumes stock and moves the order to PACKING
        } else {
          for (const i of order.items) {
            if (remaining(i) <= 0) continue;
            const got = await consumeStock(tx, { warehouseId, productId: i.productId, qty: remaining(i), releaseReserved: true });
            await tx.orderItem.update({ where: { id: i.id }, data: { pickedQty: i.pickedQty + got } });
            await tx.stockMovement.create({ data: { warehouseId, productId: i.productId, type: "PICK", quantity: -got, reference: order.number, userId: actor.userId } });
          }
        }
      }
      if (to === "READY_FOR_DISPATCH") {
        const slot = await findFreeLocation(tx, warehouseId, { zoneTypes: ["DISPATCH"], types: ["FLOOR"] });
        if (slot && order.items.length) {
          const main = [...order.items].sort((a, b) => b.quantity - a.quantity)[0]!;
          const units = order.items.reduce((s, i) => s + i.pickedQty, 0);
          await tx.pallet.create({
            data: {
              code: await nextNumber(tx, "pallet"),
              warehouseId,
              productId: main.productId,
              locationId: slot.id,
              quantity: Math.max(1, units),
              lot: order.number,
              status: "STAGED",
              grossWeightKg: Math.round((order.items.reduce((s, i) => s + i.pickedQty * i.product.unitWeightKg, 0) + 22) * 10) / 10,
            },
          });
        }
      }
      if (to === "DISPATCHED" && order.shipment && !["IN_TRANSIT", "DELAYED", "DELIVERED"].includes(order.shipment.status)) {
        throw badRequest(`Order is on shipment ${order.shipment.trackingNumber}; it is dispatched when that shipment departs`);
      }
      if (to === "CANCELLED") {
        if (from === "PROCESSING" || from === "PICKING") {
          for (const i of order.items) await releaseReservation(tx, { warehouseId, productId: i.productId, qty: remaining(i) });
        }
        // return any picked units to the pick face
        const pickZone = await tx.zone.findFirst({ where: { warehouseId, type: "PICKING" } });
        for (const i of order.items) {
          if (i.pickedQty > 0 && pickZone) {
            await adjustZoneStock(tx, { warehouseId, zoneId: pickZone.id, productId: i.productId, quantity: i.pickedQty });
            await tx.stockMovement.create({ data: { warehouseId, productId: i.productId, type: "RETURN", quantity: i.pickedQty, toZoneId: pickZone.id, reference: order.number, note: "Order cancelled", userId: actor.userId } });
          }
        }
        for (const t of order.tasks) await tx.task.update({ where: { id: t.id }, data: { status: "CANCELLED", completedAt: new Date() } });
        await tx.order.update({ where: { id }, data: { shipmentId: null } });
      }

      const current = await tx.order.findUniqueOrThrow({ where: { id } });
      const updated =
        current.status === to
          ? current
          : await tx.order.update({ where: { id }, data: { status: to, ...(to === "DISPATCHED" ? { dispatchedAt: new Date() } : {}) } });
      await audit(tx, { userId: actor.userId, action: "order.status", entityType: "Order", entityId: id, details: { from, to, note: note ?? null }, ip: actor.ip });
      await logActivity(tx, {
        warehouseId,
        type: `order.${to.toLowerCase()}`,
        message: `${order.number}: ${from.toLowerCase().replace(/_/g, " ")} → ${to.toLowerCase().replace(/_/g, " ")}${note ? ` (${note})` : ""}`,
        entityType: "Order",
        entityId: id,
        actorName: actor.name,
      });
      return updated;
    },
    { timeout: 20_000 },
  );
}

export async function assignOrderToShipment(db: Db, warehouseId: string, id: string, shipmentId: string | null, actor: UserActor) {
  const order = await db.order.findFirst({ where: { id, warehouseId } });
  if (!order) throw notFound("Order");
  if (["DISPATCHED", "DELIVERED", "CANCELLED"].includes(order.status)) throw badRequest("This order can no longer be reassigned");
  if (shipmentId) {
    const s = await db.shipment.findFirst({ where: { id: shipmentId, warehouseId } });
    if (!s) throw notFound("Shipment");
    if (s.direction !== "OUTBOUND") throw badRequest("Orders can only ship on outbound shipments");
    if (!["PLANNED", "AT_DOCK", "LOADING"].includes(s.status)) throw badRequest(`Shipment ${s.trackingNumber} is ${s.status.toLowerCase().replace("_", " ")}`);
  }
  const updated = await db.order.update({ where: { id }, data: { shipmentId } });
  await audit(db, { userId: actor.userId, action: "order.assign_shipment", entityType: "Order", entityId: id, details: { shipmentId }, ip: actor.ip });
  await logActivity(db, { warehouseId, type: "order.assigned", message: `${order.number} ${shipmentId ? "assigned to a shipment" : "removed from its shipment"}`, entityType: "Order", entityId: id, actorName: actor.name });
  return updated;
}

export function sortByPriority<T extends { priority: keyof typeof PRIORITY_ORDER }>(rows: T[]) {
  return [...rows].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
