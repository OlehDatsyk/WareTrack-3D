import type { Db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { badRequest, conflict, notFound } from "@/server/errors";
import { audit, logActivity, notify } from "@/server/audit";
import type { ProductInput, ProductQuery } from "@/schemas/inventory";
import { adjustZoneStock, countsAsInventory } from "./stock";

type UserActor = { userId: string; name: string; ip?: string | null };

export type InventoryRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  reorderLevel: number;
  reorderQty: number;
  isActive: boolean;
  supplier: string | null;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  value: number;
  zones: string | null;
  status: "ok" | "low" | "out";
};

const SORT_SQL: Record<ProductQuery["sort"], Prisma.Sql> = {
  sku: Prisma.sql`p.sku`,
  name: Prisma.sql`p.name`,
  category: Prisma.sql`p.category`,
  onHand: Prisma.sql`"onHand"`,
  available: Prisma.sql`available`,
  reserved: Prisma.sql`reserved`,
  damaged: Prisma.sql`damaged`,
  value: Prisma.sql`value`,
};

function inventoryCte(warehouseId: string) {
  // Sellable stock lives in storage, picking, yard and receiving zones.
  return Prisma.sql`
    WITH agg AS (
      SELECT i."productId",
             SUM(i.quantity)::int AS "onHand",
             SUM(i.reserved)::int AS reserved,
             SUM(i.damaged)::int AS damaged,
             STRING_AGG(DISTINCT CASE WHEN i.quantity > 0 THEN z.name END, ', ') AS zones
      FROM "InventoryItem" i
      JOIN "Zone" z ON z.id = i."zoneId"
      WHERE i."warehouseId" = ${warehouseId}
      GROUP BY i."productId"
    )`;
}

export async function listInventory(db: Db, warehouseId: string, q: ProductQuery) {
  const filters: Prisma.Sql[] = [];
  if (!q.includeArchived) filters.push(Prisma.sql`p."isActive" = true`);
  if (q.q) {
    const like = `%${q.q}%`;
    filters.push(Prisma.sql`(p.sku ILIKE ${like} OR p.name ILIKE ${like} OR p.barcode ILIKE ${like})`);
  }
  if (q.category) filters.push(Prisma.sql`p.category = ${q.category}`);
  const avail = Prisma.sql`(COALESCE(a."onHand",0) - COALESCE(a.reserved,0))`;
  if (q.stock === "out") filters.push(Prisma.sql`${avail} <= 0`);
  if (q.stock === "low") filters.push(Prisma.sql`${avail} > 0 AND ${avail} < p."reorderLevel"`);
  if (q.stock === "ok") filters.push(Prisma.sql`${avail} >= p."reorderLevel"`);
  const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty;
  const dir = q.dir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  const rows = await db.$queryRaw<(Omit<InventoryRow, "status" | "unitCost" | "value"> & { unitCost: Prisma.Decimal; value: number })[]>`
    ${inventoryCte(warehouseId)}
    SELECT p.id, p.sku, p.barcode, p.name, p.category, p.unit, p."unitCost", p."reorderLevel", p."reorderQty", p."isActive",
           s.name AS supplier,
           COALESCE(a."onHand", 0)::int AS "onHand",
           COALESCE(a.reserved, 0)::int AS reserved,
           ${avail}::int AS available,
           COALESCE(a.damaged, 0)::int AS damaged,
           (COALESCE(a."onHand", 0) * p."unitCost")::float AS value,
           a.zones
    FROM "Product" p
    LEFT JOIN agg a ON a."productId" = p.id
    LEFT JOIN "Supplier" s ON s.id = p."supplierId"
    ${where}
    ORDER BY ${SORT_SQL[q.sort]} ${dir}, p.sku ASC
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

  const [{ total }] = await db.$queryRaw<{ total: number }[]>`
    ${inventoryCte(warehouseId)}
    SELECT COUNT(*)::int AS total FROM "Product" p LEFT JOIN agg a ON a."productId" = p.id ${where}`;

  const [summary] = await db.$queryRaw<{ skus: number; units: number; value: number; low: number; out: number; damaged: number }[]>`
    ${inventoryCte(warehouseId)}
    SELECT COUNT(*)::int AS skus,
           COALESCE(SUM(a."onHand"),0)::int AS units,
           COALESCE(SUM(COALESCE(a."onHand",0) * p."unitCost"),0)::float AS value,
           COUNT(*) FILTER (WHERE ${avail} > 0 AND ${avail} < p."reorderLevel")::int AS low,
           COUNT(*) FILTER (WHERE ${avail} <= 0)::int AS out,
           COALESCE(SUM(a.damaged),0)::int AS damaged
    FROM "Product" p LEFT JOIN agg a ON a."productId" = p.id WHERE p."isActive" = true`;

  const items: InventoryRow[] = rows.map((r) => ({
    ...r,
    unitCost: Number(r.unitCost),
    status: r.available <= 0 ? "out" : r.available < r.reorderLevel ? "low" : "ok",
  }));
  return { items, total, summary };
}

export async function inventoryCsv(db: Db, warehouseId: string, q: ProductQuery) {
  const { items } = await listInventory(db, warehouseId, { ...q, page: 1, pageSize: 100_000 });
  const header = ["SKU", "Barcode", "Name", "Category", "Unit", "On hand", "Reserved", "Available", "Damaged", "Reorder level", "Status", "Unit cost", "Stock value", "Zones", "Supplier"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // neutralise spreadsheet formula injection and quote special characters
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header.join(",")];
  for (const r of items) {
    lines.push(
      [r.sku, r.barcode, r.name, r.category, r.unit, r.onHand, r.reserved, r.available, r.damaged, r.reorderLevel, r.status, r.unitCost.toFixed(2), r.value.toFixed(2), r.zones, r.supplier]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function getProductDetail(db: Db, warehouseId: string, id: string) {
  const product = await db.product.findUnique({ where: { id }, include: { supplier: true } });
  if (!product) throw notFound("Product");
  const [stock, pallets, movements, demand] = await Promise.all([
    db.inventoryItem.findMany({
      where: { warehouseId, productId: id },
      include: { zone: { select: { id: true, name: true, code: true, type: true } } },
      orderBy: { quantity: "desc" },
    }),
    db.pallet.findMany({
      where: { warehouseId, productId: id, locationId: { not: null } },
      include: { location: { select: { code: true, zone: { select: { name: true } } } } },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
    db.stockMovement.findMany({
      where: { warehouseId, productId: id },
      include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.orderItem.findMany({
      where: { productId: id, order: { warehouseId, status: { in: ["PENDING", "PROCESSING", "PICKING", "PACKING"] } } },
      include: { order: { select: { id: true, number: true, status: true } } },
    }),
  ]);
  const onHand = stock.reduce((s, i) => s + i.quantity, 0);
  const reserved = stock.reduce((s, i) => s + i.reserved, 0);
  const damaged = stock.reduce((s, i) => s + i.damaged, 0);
  return {
    ...product,
    unitCost: Number(product.unitCost),
    totals: { onHand, reserved, available: onHand - reserved, damaged, openDemand: demand.reduce((s, d) => s + d.quantity - d.pickedQty, 0) },
    stock,
    pallets,
    movements,
    demand,
  };
}

export async function createProduct(db: Db, input: ProductInput, actor: UserActor) {
  const product = await db.product.create({ data: { ...input, unitCost: new Prisma.Decimal(input.unitCost) } });
  await audit(db, { userId: actor.userId, action: "product.create", entityType: "Product", entityId: product.id, details: { sku: product.sku }, ip: actor.ip });
  return product;
}

export async function updateProduct(db: Db, id: string, input: Partial<ProductInput> & { isActive?: boolean }, actor: UserActor) {
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) throw notFound("Product");
  const product = await db.product.update({
    where: { id },
    data: { ...input, ...(input.unitCost != null ? { unitCost: new Prisma.Decimal(input.unitCost) } : {}) },
  });
  await audit(db, { userId: actor.userId, action: "product.update", entityType: "Product", entityId: id, details: input as Prisma.InputJsonValue, ip: actor.ip });
  return product;
}

/** Hard-deletes a product with no history; otherwise archives it so records stay intact. */
export async function deleteProduct(db: Db, id: string, actor: UserActor) {
  const p = await db.product.findUnique({
    where: { id },
    include: { _count: { select: { orderItems: true, pallets: true, movements: true } }, inventory: { select: { quantity: true, damaged: true } } },
  });
  if (!p) throw notFound("Product");
  const stock = p.inventory.reduce((s, i) => s + i.quantity + i.damaged, 0);
  if (stock > 0 || p._count.pallets > 0) throw conflict("This product still has stock on hand. Adjust or transfer it out before deleting.");
  const open = await db.orderItem.count({ where: { productId: id, order: { status: { notIn: ["DELIVERED", "CANCELLED"] } } } });
  if (open > 0) throw conflict("This product is on open orders and cannot be deleted.");
  if (p._count.orderItems > 0 || p._count.movements > 0) {
    await db.product.update({ where: { id }, data: { isActive: false } });
    await audit(db, { userId: actor.userId, action: "product.archive", entityType: "Product", entityId: id, details: { sku: p.sku }, ip: actor.ip });
    return { id, archived: true };
  }
  await db.inventoryItem.deleteMany({ where: { productId: id } });
  await db.product.delete({ where: { id } });
  await audit(db, { userId: actor.userId, action: "product.delete", entityType: "Product", entityId: id, details: { sku: p.sku }, ip: actor.ip });
  return { id, archived: false };
}

async function zoneOf(db: Db, warehouseId: string, zoneId: string) {
  const z = await db.zone.findFirst({ where: { id: zoneId, warehouseId } });
  if (!z) throw notFound("Zone");
  return z;
}

async function lowStockCheck(db: Db, warehouseId: string, productId: string) {
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) return;
  const agg = await db.inventoryItem.aggregate({ where: { warehouseId, productId }, _sum: { quantity: true, reserved: true } });
  const available = (agg._sum.quantity ?? 0) - (agg._sum.reserved ?? 0);
  if (available < p.reorderLevel) {
    await notify(db, {
      warehouseId,
      category: "INVENTORY",
      priority: available <= 0 ? "CRITICAL" : "MEDIUM",
      title: `Low stock: ${p.name}`,
      message: `${p.sku} has ${available} available units (reorder level ${p.reorderLevel}).`,
      link: `/inventory?product=${p.id}`,
      entityType: "Product",
      entityId: p.id,
      dedupeKey: `low-stock:${p.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}

export async function adjustStock(db: Db, warehouseId: string, productId: string, input: { zoneId: string; delta: number; reason: string }, actor: UserActor) {
  const zone = await zoneOf(db, warehouseId, input.zoneId);
  if (!countsAsInventory(zone.type)) throw badRequest(`${zone.name} holds outbound goods and is not part of on-hand stock`);
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("Product");
  const result = await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { zoneId_productId: { zoneId: zone.id, productId } } });
    const current = item?.quantity ?? 0;
    if (current + input.delta < (item?.reserved ?? 0)) {
      throw badRequest(`Cannot go below ${item?.reserved ?? 0} reserved units in ${zone.name} (currently ${current})`);
    }
    const updated = await adjustZoneStock(tx, { warehouseId, zoneId: zone.id, productId, quantity: input.delta });
    await tx.inventoryItem.update({ where: { id: updated.id }, data: { lastCountAt: new Date() } });
    await tx.stockMovement.create({
      data: { warehouseId, productId, type: "ADJUSTMENT", quantity: input.delta, toZoneId: zone.id, note: input.reason, userId: actor.userId },
    });
    await audit(tx, { userId: actor.userId, action: "inventory.adjust", entityType: "Product", entityId: productId, details: { zone: zone.code, delta: input.delta, reason: input.reason, before: current }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "inventory.adjust", message: `${product.sku} adjusted ${input.delta > 0 ? "+" : ""}${input.delta} in ${zone.name}: ${input.reason}`, entityType: "Product", entityId: productId, actorName: actor.name });
    return updated;
  });
  await lowStockCheck(db, warehouseId, productId);
  return result;
}

export async function transferStock(db: Db, warehouseId: string, productId: string, input: { fromZoneId: string; toZoneId: string; quantity: number; note?: string }, actor: UserActor) {
  const [from, to] = await Promise.all([zoneOf(db, warehouseId, input.fromZoneId), zoneOf(db, warehouseId, input.toZoneId)]);
  if (to.status === "MAINTENANCE" || to.status === "CLOSED") throw badRequest(`${to.name} is ${to.status.toLowerCase()} and cannot receive stock`);
  if (!countsAsInventory(from.type) || !countsAsInventory(to.type)) throw badRequest("Use the order workflow to move goods into packing or dispatch");
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("Product");
  return db.$transaction(async (tx) => {
    const src = await tx.inventoryItem.findUnique({ where: { zoneId_productId: { zoneId: from.id, productId } } });
    const available = (src?.quantity ?? 0) - (src?.reserved ?? 0);
    if (input.quantity > available) throw badRequest(`Only ${available} unreserved units available in ${from.name}`);
    if (to.type === "DAMAGED") {
      await adjustZoneStock(tx, { warehouseId, zoneId: from.id, productId, quantity: -input.quantity });
      await adjustZoneStock(tx, { warehouseId, zoneId: to.id, productId, damaged: input.quantity });
    } else {
      await adjustZoneStock(tx, { warehouseId, zoneId: from.id, productId, quantity: -input.quantity });
      await adjustZoneStock(tx, { warehouseId, zoneId: to.id, productId, quantity: input.quantity });
    }
    await tx.stockMovement.create({
      data: { warehouseId, productId, type: "TRANSFER", quantity: input.quantity, fromZoneId: from.id, toZoneId: to.id, note: input.note, userId: actor.userId },
    });
    await audit(tx, { userId: actor.userId, action: "inventory.transfer", entityType: "Product", entityId: productId, details: { from: from.code, to: to.code, quantity: input.quantity }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "inventory.transfer", message: `${input.quantity} × ${product.sku} transferred ${from.name} → ${to.name}`, entityType: "Product", entityId: productId, actorName: actor.name });
    return { ok: true };
  });
}

export async function recordZoneDamage(db: Db, warehouseId: string, productId: string, input: { zoneId: string; quantity: number; note: string }, actor: UserActor) {
  const zone = await zoneOf(db, warehouseId, input.zoneId);
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("Product");
  const res = await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { zoneId_productId: { zoneId: zone.id, productId } } });
    const available = (item?.quantity ?? 0) - (item?.reserved ?? 0);
    if (input.quantity > available) throw badRequest(`Only ${available} unreserved units in ${zone.name}`);
    await adjustZoneStock(tx, { warehouseId, zoneId: zone.id, productId, quantity: -input.quantity, damaged: input.quantity });
    await tx.stockMovement.create({
      data: { warehouseId, productId, type: "DAMAGE", quantity: -input.quantity, fromZoneId: zone.id, note: input.note, userId: actor.userId },
    });
    await tx.notification.create({
      data: { warehouseId, category: "INVENTORY", priority: "MEDIUM", title: `Damaged goods reported — ${product.sku}`, message: `${input.quantity} units in ${zone.name}: ${input.note}`, link: `/inventory?product=${productId}`, entityType: "Product", entityId: productId },
    });
    await audit(tx, { userId: actor.userId, action: "inventory.damage", entityType: "Product", entityId: productId, details: { zone: zone.code, quantity: input.quantity, note: input.note }, ip: actor.ip });
    await logActivity(tx, { warehouseId, type: "inventory.damage", message: `${input.quantity} × ${product.sku} recorded as damaged in ${zone.name}`, entityType: "Product", entityId: productId, actorName: actor.name });
    return { ok: true };
  });
  await lowStockCheck(db, warehouseId, productId);
  return res;
}

export async function listCategories(db: Db) {
  const rows = await db.product.groupBy({ by: ["category"], where: { isActive: true }, _count: { _all: true }, orderBy: { category: "asc" } });
  return rows.map((r) => ({ category: r.category, count: r._count._all }));
}
