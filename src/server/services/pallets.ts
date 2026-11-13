import type { Db } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { audit, logActivity } from "@/server/audit";
import { createTask, findFreeLocation, movePallet, nextNumber, startTask, type Actor } from "./operations";
import { adjustZoneStock } from "./stock";

type UserActor = Actor & { userId: string; name: string; ip?: string | null };

export async function getPallet(db: Db, warehouseId: string, id: string) {
  const pallet = await db.pallet.findFirst({
    where: { id, warehouseId },
    include: {
      product: { include: { supplier: { select: { name: true } } } },
      location: { include: { zone: { select: { id: true, code: true, name: true, type: true, status: true } }, rack: { select: { id: true, code: true } } } },
      tasks: {
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        include: { vehicle: { select: { code: true } }, toLocation: { select: { code: true } } },
      },
      movements: { orderBy: { createdAt: "desc" }, take: 8, include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } } } },
    },
  });
  if (!pallet) throw notFound("Pallet");
  return pallet;
}

export async function listFreeLocations(db: Db, warehouseId: string, opts: { zoneId?: string; minWeightKg?: number; limit?: number }) {
  return db.storageLocation.findMany({
    where: {
      warehouseId,
      isBlocked: false,
      pallet: { is: null },
      zone: { status: { notIn: ["MAINTENANCE", "CLOSED"] } },
      tasksTo: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } },
      ...(opts.zoneId ? { zoneId: opts.zoneId } : {}),
      ...(opts.minWeightKg ? { maxWeightKg: { gte: opts.minWeightKg } } : {}),
    },
    select: { id: true, code: true, type: true, level: true, zone: { select: { id: true, name: true, code: true } } },
    orderBy: [{ zone: { code: "asc" } }, { level: "asc" }, { code: "asc" }],
    take: opts.limit ?? 200,
  });
}

/** Move a pallet: either immediately or by creating (and starting) a forklift task. */
export async function requestPalletMove(
  db: Db,
  warehouseId: string,
  palletId: string,
  input: { toLocationId: string; mode: "task" | "now"; vehicleId?: string | null; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" },
  actor: UserActor,
) {
  return db.$transaction(async (tx) => {
    const pallet = await tx.pallet.findFirst({ where: { id: palletId, warehouseId }, include: { product: { select: { name: true } } } });
    if (!pallet) throw notFound("Pallet");
    if (input.toLocationId === pallet.locationId) throw badRequest("The pallet is already in that location");
    const target = await tx.storageLocation.findFirst({ where: { id: input.toLocationId, warehouseId }, select: { code: true } });
    if (!target) throw notFound("Target location");

    if (input.mode === "now") {
      const moved = await movePallet(tx, { warehouseId, palletId, toLocationId: input.toLocationId, actor });
      await audit(tx, { userId: actor.userId, action: "pallet.move", entityType: "Pallet", entityId: palletId, details: { from: moved.from, to: moved.to }, ip: actor.ip });
      await logActivity(tx, { warehouseId, type: "pallet.moved", message: `${pallet.code} moved ${moved.from ? `from ${moved.from} ` : ""}to ${moved.to}`, entityType: "Pallet", entityId: palletId, actorName: actor.name });
      return { mode: "now" as const, pallet: moved.pallet, task: null };
    }
    const task = await createTask(
      tx,
      {
        warehouseId,
        type: "TRANSFER",
        description: `Move ${pallet.code} (${pallet.product.name}) to ${target.code}`,
        palletId,
        fromLocationId: pallet.locationId,
        toLocationId: input.toLocationId,
        priority: input.priority,
        vehicleId: input.vehicleId ?? null,
      },
      actor,
    );
    let started = task;
    if (input.vehicleId) started = await startTask(tx, task.id, { vehicleId: input.vehicleId }, actor);
    await audit(tx, { userId: actor.userId, action: "task.create", entityType: "Task", entityId: task.id, details: { type: "TRANSFER", pallet: pallet.code, to: target.code, vehicleId: input.vehicleId ?? null }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "task.created", message: `${task.number} created: move ${pallet.code} to ${target.code}`, entityType: "Task", entityId: task.id, actorName: actor.name });
    return { mode: "task" as const, pallet, task: started };
  });
}

/** Record damaged units on a pallet; optionally relocate the damaged units to the damaged-goods zone. */
export async function recordPalletDamage(
  db: Db,
  warehouseId: string,
  palletId: string,
  input: { quantity: number; note: string; moveToDamagedZone: boolean },
  actor: UserActor,
) {
  return db.$transaction(async (tx) => {
    const pallet = await tx.pallet.findFirst({ where: { id: palletId, warehouseId }, include: { location: { include: { zone: true } }, product: true } });
    if (!pallet) throw notFound("Pallet");
    if (pallet.status === "DAMAGED") throw badRequest("This pallet is already marked as damaged");
    if (input.quantity > pallet.quantity) throw badRequest(`Pallet only holds ${pallet.quantity} units`);
    const zone = pallet.location?.zone;
    const full = input.quantity === pallet.quantity;
    let damagedPalletId = pallet.id;
    if (full) {
      // whole pallet: flag it and convert its zone stock to damaged
      if (zone && zone.type !== "DISPATCH" && zone.type !== "PACKING") {
        await adjustZoneStock(tx, { warehouseId, zoneId: zone.id, productId: pallet.productId, quantity: -pallet.quantity, damaged: pallet.quantity });
      }
      await tx.pallet.update({ where: { id: pallet.id }, data: { status: "DAMAGED" } });
    } else {
      // split: damaged units go to a new handling unit
      await tx.pallet.update({ where: { id: pallet.id }, data: { quantity: pallet.quantity - input.quantity } });
      if (zone && zone.type !== "DISPATCH" && zone.type !== "PACKING") {
        await adjustZoneStock(tx, { warehouseId, zoneId: zone.id, productId: pallet.productId, quantity: -input.quantity, damaged: input.quantity });
      }
      const split = await tx.pallet.create({
        data: {
          code: await nextNumber(tx, "pallet"),
          warehouseId,
          productId: pallet.productId,
          quantity: input.quantity,
          lot: pallet.lot,
          status: "DAMAGED",
          grossWeightKg: Math.round((input.quantity * pallet.product.unitWeightKg + 15) * 10) / 10,
          receivedAt: pallet.receivedAt,
        },
      });
      damagedPalletId = split.id;
      if (zone) {
        // the split unit sits in the same zone until it is moved; keep stock accounting there
        await tx.pallet.update({ where: { id: split.id }, data: { locationId: null } });
      }
    }
    await tx.stockMovement.create({
      data: { warehouseId, productId: pallet.productId, palletId: damagedPalletId, type: "DAMAGE", quantity: -input.quantity, fromZoneId: zone?.id ?? null, note: input.note, reference: pallet.code, userId: actor.userId },
    });

    let moved: string | null = null;
    if (input.moveToDamagedZone) {
      const slot = await findFreeLocation(tx, warehouseId, { zoneTypes: ["DAMAGED"], types: ["FLOOR"] });
      if (slot) {
        if (!full && zone) {
          // damaged units were booked in the source zone; move that booking along with the unit
          await adjustZoneStock(tx, { warehouseId, zoneId: zone.id, productId: pallet.productId, damaged: -input.quantity });
          await adjustZoneStock(tx, { warehouseId, zoneId: slot.zoneId, productId: pallet.productId, damaged: input.quantity });
          await tx.pallet.update({ where: { id: damagedPalletId }, data: { locationId: slot.id } });
        } else {
          await movePallet(tx, { warehouseId, palletId: damagedPalletId, toLocationId: slot.id, actor });
        }
        moved = slot.code;
      }
    }
    await tx.notification.create({
      data: {
        warehouseId,
        category: "INVENTORY",
        priority: "MEDIUM",
        title: `Damaged goods reported — ${pallet.code}`,
        message: `${input.quantity} × ${pallet.product.name}: ${input.note}`,
        link: `/inventory?product=${pallet.productId}`,
        entityType: "Pallet",
        entityId: damagedPalletId,
      },
    });
    await audit(tx, { userId: actor.userId, action: "inventory.damage", entityType: "Pallet", entityId: pallet.id, details: { quantity: input.quantity, note: input.note, movedTo: moved }, ip: actor.ip });
    await logActivity(tx, {
      warehouseId,
      type: "inventory.damage",
      message: `${input.quantity} × ${pallet.product.name} on ${pallet.code} recorded as damaged${moved ? ` and moved to ${moved}` : ""}`,
      entityType: "Pallet",
      entityId: pallet.id,
      actorName: actor.name,
    });
    return { palletId: damagedPalletId, movedTo: moved };
  });
}
