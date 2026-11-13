import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adjustStock, deleteProduct, listInventory, recordZoneDamage, transferStock } from "@/server/services/inventory";
import { recordPalletDamage, requestPalletMove } from "@/server/services/pallets";
import { completeTask } from "@/server/services/operations";
import { productQuerySchema } from "@/schemas/inventory";
import { actor, mainWarehouse, resetDatabase } from "../helpers";

let warehouseId: string;
let managerId: string;

beforeAll(async () => {
  await resetDatabase();
  warehouseId = (await mainWarehouse()).id;
  managerId = (await db.user.findFirstOrThrow({ where: { role: "MANAGER" } })).id;
});

async function zone(code: string) {
  return db.zone.findFirstOrThrow({ where: { warehouseId, code } });
}
async function stockIn(zoneId: string, productId: string) {
  return db.inventoryItem.findUnique({ where: { zoneId_productId: { zoneId, productId } } });
}

describe("inventory listing", () => {
  it("aggregates stock, flags low stock and paginates", async () => {
    const all = await listInventory(db, warehouseId, productQuerySchema.parse({ page: 1, pageSize: 10, sort: "sku", dir: "asc" }));
    expect(all.items).toHaveLength(10);
    expect(all.total).toBeGreaterThan(40);
    const low = await listInventory(db, warehouseId, productQuerySchema.parse({ page: 1, pageSize: 50, sort: "available", dir: "asc", stock: "low" }));
    expect(low.items.length).toBeGreaterThan(0);
    for (const r of low.items) {
      expect(r.available).toBeLessThan(r.reorderLevel);
      expect(r.status).toBe("low");
    }
    const sorted = await listInventory(db, warehouseId, productQuerySchema.parse({ page: 1, pageSize: 20, sort: "onHand", dir: "desc" }));
    for (let i = 1; i < sorted.items.length; i++) expect(sorted.items[i - 1]!.onHand).toBeGreaterThanOrEqual(sorted.items[i]!.onHand);
  });
});

describe("stock adjustments", () => {
  it("adjusts quantity, writes a movement and an audit entry", async () => {
    const pck = await zone("PCK");
    const item = await db.inventoryItem.findFirstOrThrow({ where: { zoneId: pck.id, quantity: { gt: 20 } } });
    await adjustStock(db, warehouseId, item.productId, { zoneId: pck.id, delta: -5, reason: "Cycle count" }, actor(managerId));
    expect((await stockIn(pck.id, item.productId))!.quantity).toBe(item.quantity - 5);
    expect(await db.stockMovement.count({ where: { productId: item.productId, type: "ADJUSTMENT", note: "Cycle count" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "inventory.adjust", entityId: item.productId } })).toBe(1);
  });

  it("refuses to drop below reserved stock", async () => {
    const sta = await zone("STA");
    const item = await db.inventoryItem.findFirstOrThrow({ where: { zoneId: sta.id, quantity: { gt: 10 } } });
    await db.inventoryItem.update({ where: { id: item.id }, data: { reserved: item.quantity - 2 } });
    await expect(adjustStock(db, warehouseId, item.productId, { zoneId: sta.id, delta: -5, reason: "Too much" }, actor(managerId))).rejects.toMatchObject({ status: 400 });
    await db.inventoryItem.update({ where: { id: item.id }, data: { reserved: 0 } });
  });

  it("transfers unreserved units between zones", async () => {
    const [sta, pck] = [await zone("STA"), await zone("PCK")];
    const src = await db.inventoryItem.findFirstOrThrow({ where: { zoneId: sta.id, quantity: { gt: 30 }, reserved: 0 } });
    const before = (await stockIn(pck.id, src.productId))?.quantity ?? 0;
    await transferStock(db, warehouseId, src.productId, { fromZoneId: sta.id, toZoneId: pck.id, quantity: 10 }, actor(managerId));
    expect((await stockIn(sta.id, src.productId))!.quantity).toBe(src.quantity - 10);
    expect((await stockIn(pck.id, src.productId))!.quantity).toBe(before + 10);
    await expect(transferStock(db, warehouseId, src.productId, { fromZoneId: sta.id, toZoneId: pck.id, quantity: 1_000_000 }, actor(managerId))).rejects.toMatchObject({ status: 400 });
  });

  it("refuses transfers into a zone under maintenance", async () => {
    const [sta, yrd] = [await zone("STA"), await zone("YRD")];
    await db.zone.update({ where: { id: yrd.id }, data: { status: "MAINTENANCE" } });
    const src = await db.inventoryItem.findFirstOrThrow({ where: { zoneId: sta.id, quantity: { gt: 5 } } });
    await expect(transferStock(db, warehouseId, src.productId, { fromZoneId: sta.id, toZoneId: yrd.id, quantity: 1 }, actor(managerId))).rejects.toMatchObject({ status: 400 });
    await db.zone.update({ where: { id: yrd.id }, data: { status: "ACTIVE" } });
  });

  it("moves damaged units out of available stock", async () => {
    const pck = await zone("PCK");
    const item = await db.inventoryItem.findFirstOrThrow({ where: { zoneId: pck.id, quantity: { gt: 10 }, reserved: 0 } });
    await recordZoneDamage(db, warehouseId, item.productId, { zoneId: pck.id, quantity: 3, note: "Dropped carton" }, actor(managerId));
    const after = (await stockIn(pck.id, item.productId))!;
    expect(after.quantity).toBe(item.quantity - 3);
    expect(after.damaged).toBe(item.damaged + 3);
  });
});

describe("pallet moves", () => {
  it("moves a pallet immediately and books its stock in the new zone", async () => {
    const pallet = await db.pallet.findFirstOrThrow({ where: { warehouseId, status: "STORED", location: { zone: { code: "STA" } } }, include: { location: true } });
    const target = await db.storageLocation.findFirstOrThrow({ where: { warehouseId, zone: { code: "STB" }, type: "RACK", pallet: { is: null } } });
    const [sta, stb] = [await zone("STA"), await zone("STB")];
    const srcBefore = (await stockIn(sta.id, pallet.productId))!.quantity;
    const dstBefore = (await stockIn(stb.id, pallet.productId))?.quantity ?? 0;
    await requestPalletMove(db, warehouseId, pallet.id, { toLocationId: target.id, mode: "now", priority: "NORMAL" }, actor(managerId));
    const moved = await db.pallet.findUniqueOrThrow({ where: { id: pallet.id } });
    expect(moved.locationId).toBe(target.id);
    expect((await stockIn(sta.id, pallet.productId))!.quantity).toBe(srcBefore - pallet.quantity);
    expect((await stockIn(stb.id, pallet.productId))!.quantity).toBe(dstBefore + pallet.quantity);
  });

  it("rejects occupied targets and overweight shelf slots", async () => {
    const pallet = await db.pallet.findFirstOrThrow({ where: { warehouseId, status: "STORED", location: { type: "RACK" }, grossWeightKg: { gt: 200 } } });
    const occupied = await db.storageLocation.findFirstOrThrow({ where: { warehouseId, type: "RACK", pallet: { isNot: null }, id: { not: pallet.locationId! } } });
    await expect(requestPalletMove(db, warehouseId, pallet.id, { toLocationId: occupied.id, mode: "now", priority: "NORMAL" }, actor(managerId))).rejects.toMatchObject({ status: 409 });
    const shelf = await db.storageLocation.findFirstOrThrow({ where: { warehouseId, type: "SHELF", pallet: { is: null } } });
    await expect(requestPalletMove(db, warehouseId, pallet.id, { toLocationId: shelf.id, mode: "now", priority: "NORMAL" }, actor(managerId))).rejects.toMatchObject({ status: 400 });
  });

  it("creates a transfer task that reserves the destination until completed", async () => {
    const pallet = await db.pallet.findFirstOrThrow({ where: { warehouseId, status: "STORED", location: { zone: { code: "STA" } }, tasks: { none: {} } } });
    const target = await db.storageLocation.findFirstOrThrow({ where: { warehouseId, zone: { code: "STA" }, type: "RACK", pallet: { is: null } } });
    const res = await requestPalletMove(db, warehouseId, pallet.id, { toLocationId: target.id, mode: "task", priority: "HIGH" }, actor(managerId));
    expect(res.task?.status).toBe("PENDING");
    // a second move to the same slot is refused while the task is open
    const other = await db.pallet.findFirstOrThrow({ where: { warehouseId, status: "STORED", id: { not: pallet.id }, tasks: { none: {} } } });
    await expect(requestPalletMove(db, warehouseId, other.id, { toLocationId: target.id, mode: "task", priority: "NORMAL" }, actor(managerId))).rejects.toMatchObject({ status: 409 });
    await db.$transaction((tx) => completeTask(tx, res.task!.id, actor(managerId)));
    expect((await db.pallet.findUniqueOrThrow({ where: { id: pallet.id } })).locationId).toBe(target.id);
  });

  it("records pallet damage and moves it to the damaged-goods zone", async () => {
    const pallet = await db.pallet.findFirstOrThrow({ where: { warehouseId, status: "STORED", location: { zone: { code: "STB" } }, tasks: { none: {} } } });
    const res = await recordPalletDamage(db, warehouseId, pallet.id, { quantity: pallet.quantity, note: "Forklift impact", moveToDamagedZone: true }, actor(managerId));
    const after = await db.pallet.findUniqueOrThrow({ where: { id: pallet.id }, include: { location: { include: { zone: true } } } });
    expect(after.status).toBe("DAMAGED");
    expect(after.location?.zone.type).toBe("DAMAGED");
    expect(res.movedTo).toBeTruthy();
    const dmg = await zone("DMG");
    expect((await stockIn(dmg.id, pallet.productId))!.damaged).toBeGreaterThanOrEqual(pallet.quantity);
  });
});

describe("product deletion", () => {
  it("refuses to delete products with stock and archives products with history", async () => {
    const withStock = await db.inventoryItem.findFirstOrThrow({ where: { warehouseId, quantity: { gt: 0 } } });
    await expect(deleteProduct(db, withStock.productId, actor(managerId))).rejects.toMatchObject({ status: 409 });
    const p = await db.product.create({ data: { sku: "HIST-1", name: "With history", category: "Tools" } });
    await db.stockMovement.create({ data: { warehouseId, productId: p.id, type: "ADJUSTMENT", quantity: 0 } });
    const res = await deleteProduct(db, p.id, actor(managerId));
    expect(res.archived).toBe(true);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).isActive).toBe(false);
  });
});
