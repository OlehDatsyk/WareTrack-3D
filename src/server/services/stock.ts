/**
 * Stock accounting rules
 * ──────────────────────
 * InventoryItem(zone, product).quantity = good units on hand in that zone (incl. reserved).
 * InventoryItem.damaged                 = damaged units held in that zone (not sellable).
 * Pallets in DISPATCH / PACKING zones are picked outbound goods and are NOT counted as on-hand.
 * Moving a pallet between zones moves its units between InventoryItems following these rules.
 */
import type { Tx } from "@/server/db";
import type { PalletStatus, ZoneType } from "@/generated/prisma/enums";
import { badRequest } from "@/server/errors";

export function countsAsInventory(zoneType: ZoneType) {
  return zoneType !== "DISPATCH" && zoneType !== "PACKING";
}

export function palletStatusForZone(zoneType: ZoneType): PalletStatus {
  switch (zoneType) {
    case "RECEIVING":
    case "RETURNS":
      return "RECEIVED";
    case "DISPATCH":
    case "PACKING":
      return "STAGED";
    case "DAMAGED":
      return "DAMAGED";
    default:
      return "STORED";
  }
}

/** Applies deltas to an InventoryItem, creating it if needed. Quantities never go below zero. */
export async function adjustZoneStock(
  tx: Tx,
  args: { warehouseId: string; zoneId: string; productId: string; quantity?: number; damaged?: number; reserved?: number },
) {
  const existing = await tx.inventoryItem.findUnique({
    where: { zoneId_productId: { zoneId: args.zoneId, productId: args.productId } },
  });
  const quantity = Math.max(0, (existing?.quantity ?? 0) + (args.quantity ?? 0));
  const damaged = Math.max(0, (existing?.damaged ?? 0) + (args.damaged ?? 0));
  const reserved = Math.min(quantity, Math.max(0, (existing?.reserved ?? 0) + (args.reserved ?? 0)));
  if (existing) {
    return tx.inventoryItem.update({ where: { id: existing.id }, data: { quantity, damaged, reserved } });
  }
  return tx.inventoryItem.create({
    data: { warehouseId: args.warehouseId, zoneId: args.zoneId, productId: args.productId, quantity, damaged, reserved },
  });
}

/** Moves a pallet's units from one zone's stock to another's, following the accounting rules. */
export async function transferPalletStock(
  tx: Tx,
  args: {
    warehouseId: string;
    productId: string;
    qty: number;
    damagedPallet: boolean;
    from?: { id: string; type: ZoneType } | null;
    to?: { id: string; type: ZoneType } | null;
  },
) {
  const { from, to, qty } = args;
  if (from && to && from.id === to.id) return;
  const fromDamaged = args.damagedPallet || from?.type === "DAMAGED";
  const toDamaged = args.damagedPallet || to?.type === "DAMAGED";
  if (from && countsAsInventory(from.type)) {
    await adjustZoneStock(tx, {
      warehouseId: args.warehouseId,
      zoneId: from.id,
      productId: args.productId,
      ...(fromDamaged ? { damaged: -qty } : { quantity: -qty }),
    });
  }
  if (to && countsAsInventory(to.type)) {
    await adjustZoneStock(tx, {
      warehouseId: args.warehouseId,
      zoneId: to.id,
      productId: args.productId,
      ...(toDamaged ? { damaged: qty } : { quantity: qty }),
    });
  }
}

/**
 * Consumes units of a product for picking: draws from zones with available stock
 * (pick faces first, then reserve storage) and shrinks/removes pallets accordingly.
 * Returns the number of units actually consumed.
 */
export async function consumeStock(
  tx: Tx,
  args: { warehouseId: string; productId: string; qty: number; releaseReserved?: boolean },
) {
  let remaining = args.qty;
  const reservedBefore = await totalReserved(tx, args.warehouseId, args.productId);
  const items = await tx.inventoryItem.findMany({
    where: { warehouseId: args.warehouseId, productId: args.productId, quantity: { gt: 0 }, zone: { type: { in: ["PICKING", "STORAGE", "YARD", "RECEIVING"] } } },
    include: { zone: { select: { type: true } } },
  });
  const order: Record<string, number> = { PICKING: 0, STORAGE: 1, YARD: 2, RECEIVING: 3 };
  items.sort((a, b) => (order[a.zone.type] ?? 9) - (order[b.zone.type] ?? 9));
  for (const item of items) {
    if (remaining <= 0) break;
    const take = Math.min(item.quantity, remaining);
    remaining -= take;
    // reserved can never exceed what is physically left in the zone
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: item.quantity - take, reserved: Math.min(item.reserved, item.quantity - take) },
    });
    // shrink physical pallets in that zone (smallest first so empty slots free up)
    let left = take;
    const pallets = await tx.pallet.findMany({
      where: { warehouseId: args.warehouseId, productId: args.productId, location: { zoneId: item.zoneId }, status: { in: ["STORED", "RECEIVED"] }, tasks: { none: { status: { in: ["PENDING", "IN_PROGRESS"] } } } },
      orderBy: { quantity: "asc" },
    });
    for (const p of pallets) {
      if (left <= 0) break;
      const d = Math.min(p.quantity, left);
      left -= d;
      if (p.quantity - d <= 0) await tx.pallet.delete({ where: { id: p.id } });
      else await tx.pallet.update({ where: { id: p.id }, data: { quantity: p.quantity - d } });
    }
  }
  const consumed = args.qty - remaining;
  if (args.releaseReserved && consumed > 0) {
    // Reservations may sit in a different zone than the one we picked from. Release
    // whatever the clamp above did not already release, wherever it is booked.
    const releasedByClamp = reservedBefore - (await totalReserved(tx, args.warehouseId, args.productId));
    const outstanding = consumed - releasedByClamp;
    if (outstanding > 0) await releaseReservation(tx, { warehouseId: args.warehouseId, productId: args.productId, qty: outstanding });
  }
  return consumed;
}

async function totalReserved(tx: Tx, warehouseId: string, productId: string) {
  const agg = await tx.inventoryItem.aggregate({ where: { warehouseId, productId }, _sum: { reserved: true } });
  return agg._sum.reserved ?? 0;
}

/** Reserves available units across zones (largest availability first). Returns units reserved. */
export async function reserveStock(tx: Tx, args: { warehouseId: string; productId: string; qty: number }) {
  if (args.qty < 0) throw badRequest("Quantity must be positive");
  let remaining = args.qty;
  const items = await tx.inventoryItem.findMany({
    where: { warehouseId: args.warehouseId, productId: args.productId, zone: { type: { in: ["PICKING", "STORAGE", "YARD"] } } },
    orderBy: { quantity: "desc" },
  });
  for (const item of items) {
    if (remaining <= 0) break;
    const available = item.quantity - item.reserved;
    if (available <= 0) continue;
    const r = Math.min(available, remaining);
    remaining -= r;
    await tx.inventoryItem.update({ where: { id: item.id }, data: { reserved: item.reserved + r } });
  }
  return args.qty - remaining;
}

export async function releaseReservation(tx: Tx, args: { warehouseId: string; productId: string; qty: number }) {
  let remaining = args.qty;
  const items = await tx.inventoryItem.findMany({
    where: { warehouseId: args.warehouseId, productId: args.productId, reserved: { gt: 0 } },
    orderBy: { reserved: "desc" },
  });
  for (const item of items) {
    if (remaining <= 0) break;
    const r = Math.min(item.reserved, remaining);
    remaining -= r;
    await tx.inventoryItem.update({ where: { id: item.id }, data: { reserved: item.reserved - r } });
  }
}

export async function availableStock(tx: Tx, warehouseId: string, productId: string) {
  const agg = await tx.inventoryItem.aggregate({
    where: { warehouseId, productId, zone: { type: { in: ["PICKING", "STORAGE", "YARD"] } } },
    _sum: { quantity: true, reserved: true },
  });
  return (agg._sum.quantity ?? 0) - (agg._sum.reserved ?? 0);
}
