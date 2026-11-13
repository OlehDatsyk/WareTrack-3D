/* Deterministic demo data generator. Used by `prisma db seed` and by the test suite. */
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type {
  EmployeeRole,
  OrderStatus,
  PalletStatus,
  Priority,
  Shift,
  ShipmentStatus,
} from "@/generated/prisma/enums";
import { createRng, type Rng } from "@/lib/rng";
import { rackSlotPosition } from "@/lib/layout/geometry";
import { WAREHOUSE_PRESETS, type WarehousePreset } from "@/lib/layout/presets";
import { hashPassword } from "@/server/auth/password";
import { CARRIERS, CITY_MAP, CUSTOMERS, FIRST_NAMES, LAST_NAMES, PRODUCTS, SUPPLIERS, type ProductSeed } from "./catalog";

export type SeedOptions = {
  password: string;
  historyDays?: number;
  now?: Date;
  log?: (msg: string) => void;
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_USERS = [
  { email: "admin@waretrack.demo", name: "Morgan Reyes", role: "ADMIN" as const, title: "Systems Administrator" },
  { email: "manager@waretrack.demo", name: "Alex Chen", role: "MANAGER" as const, title: "Operations Manager" },
  { email: "operator@waretrack.demo", name: "Sam Patel", role: "OPERATOR" as const, title: "Forklift Team Lead" },
  { email: "viewer@waretrack.demo", name: "Jordan Lee", role: "VIEWER" as const, title: "Finance Analyst" },
];

function ean13(base12: string) {
  const digits = base12.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

async function truncateAll(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // Only WareTrack's own schema is touched, so a shared database stays safe.
  const [{ schema }] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  const list = tables.map((t) => `"${schema}"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

type Ctx = {
  prisma: PrismaClient;
  rng: Rng;
  now: Date;
  historyDays: number;
  counters: { pallet: number; order: number; shipment: number; task: number; employee: number };
  products: { id: string; sku: string; seed: ProductSeed; unitCost: number }[];
  customers: { id: string; name: string; city: string | null }[];
  managerUserId: string;
  operatorUserId: string;
};

export async function seedDatabase(prisma: PrismaClient, opts: SeedOptions) {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const rng = createRng(20261113);

  log("Clearing existing data…");
  await truncateAll(prisma);

  log("Creating suppliers, products and customers…");
  await prisma.supplier.createMany({ data: SUPPLIERS.map((s) => ({ ...s })) });
  const suppliers = await prisma.supplier.findMany();
  const supplierByName = new Map(suppliers.map((s) => [s.name, s.id]));

  await prisma.product.createMany({
    data: PRODUCTS.map((p, i) => ({
      sku: p.sku,
      barcode: ean13(`200${String(1000 + i).padStart(9, "0")}`),
      name: p.name,
      description: `${p.name}. Supplied by ${SUPPLIERS[p.supplier]!.name}.`,
      category: p.category,
      unit: p.unit,
      unitWeightKg: p.weight,
      unitCost: p.cost,
      reorderLevel: p.reorder,
      reorderQty: Math.max(p.reorder * 2, p.perPallet),
      supplierId: supplierByName.get(SUPPLIERS[p.supplier]!.name),
    })),
  });
  const productRows = await prisma.product.findMany({ select: { id: true, sku: true, unitCost: true } });
  const productSeedBySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
  const products = productRows
    .map((r) => ({ id: r.id, sku: r.sku, seed: productSeedBySku.get(r.sku)!, unitCost: Number(r.unitCost) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  await prisma.customer.createMany({
    data: CUSTOMERS.map((c) => ({
      name: c.name,
      city: c.city,
      email: `receiving@${slug(c.name.split(" ")[0]!)}.example`,
    })),
  });
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  log("Creating demo users…");
  const passwordHash = await hashPassword(opts.password);
  const users = [];
  for (const u of DEMO_USERS) {
    users.push(await prisma.user.create({ data: { ...u, passwordHash } }));
  }

  const ctx: Ctx = {
    prisma,
    rng,
    now,
    historyDays: opts.historyDays ?? 180,
    counters: { pallet: 1001, order: 10230, shipment: 78310, task: 5100, employee: 1001 },
    products,
    customers,
    managerUserId: users[1]!.id,
    operatorUserId: users[2]!.id,
  };

  const warehouseIds: string[] = [];
  for (const [index, preset] of WAREHOUSE_PRESETS.entries()) {
    log(`Building ${preset.code} ${preset.name}…`);
    warehouseIds.push(await seedWarehouse(ctx, preset, index === 0 ? 1 : 0.45, index));
  }

  await prisma.user.updateMany({ data: { defaultWarehouseId: warehouseIds[0] } });
  log("Seed complete.");
  return { warehouseIds };
}

async function seedWarehouse(ctx: Ctx, preset: WarehousePreset, scale: number, index: number) {
  const { prisma, now } = ctx;
  const wh = await prisma.warehouse.create({
    data: {
      code: preset.code,
      name: preset.name,
      address: preset.address,
      city: preset.city,
      timezone: preset.timezone,
      buildingWidth: preset.buildingWidth,
      buildingDepth: preset.buildingDepth,
      settings: {
        layout: preset.site,
        operatingHours: { open: "05:00", close: "23:00" },
        capacityWarningPct: 90,
        dockSlotMinutes: 45,
        defaultCarrier: CARRIERS[0],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // ── Zones, racks, locations, docks
  await prisma.zone.createMany({
    data: preset.zones.map((z) => ({
      warehouseId: wh.id,
      code: z.code,
      name: z.name,
      type: z.type,
      x: z.x,
      z: z.z,
      width: z.width,
      depth: z.depth,
      color: z.color,
      temperatureC: z.temperatureC ?? null,
      indoor: z.indoor ?? true,
      notes: z.notes ?? null,
    })),
  });
  const zones = await prisma.zone.findMany({ where: { warehouseId: wh.id } });
  const zoneByCode = new Map(zones.map((z) => [z.code, z]));

  const locationData: Prisma.StorageLocationCreateManyInput[] = [];
  for (const r of preset.racks) {
    const zone = zoneByCode.get(r.zone)!;
    const rack = await prisma.rack.create({
      data: {
        warehouseId: wh.id,
        zoneId: zone.id,
        code: r.code,
        kind: r.kind,
        levels: r.levels,
        columns: r.columns,
        posX: r.posX,
        posZ: r.posZ,
        rotation: 0,
        length: r.length,
        depth: r.depth,
        levelHeight: r.levelHeight,
        aisleSide: r.aisleSide,
      },
    });
    for (let c = 0; c < r.columns; c++) {
      for (let l = 0; l < r.levels; l++) {
        const pos = rackSlotPosition({ ...r, rotation: 0 }, c, l);
        locationData.push({
          warehouseId: wh.id,
          zoneId: zone.id,
          rackId: rack.id,
          code: `${r.code}-${String(c + 1).padStart(2, "0")}-${l + 1}`,
          type: r.kind === "SHELVING" ? "SHELF" : "RACK",
          level: l,
          column: c,
          posX: pos.x,
          posY: pos.y,
          posZ: pos.z,
          maxWeightKg: r.kind === "SHELVING" ? 150 : 1200,
        });
      }
    }
  }
  for (const g of preset.floorGrids) {
    const zone = zoneByCode.get(g.zone)!;
    let n = 1;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        locationData.push({
          warehouseId: wh.id,
          zoneId: zone.id,
          code: `${g.prefix}-F${String(n++).padStart(2, "0")}`,
          type: "FLOOR",
          column: col,
          level: row,
          posX: g.originX + col * g.spacingX,
          posY: 0,
          posZ: g.originZ + row * g.spacingZ,
          maxWeightKg: 1500,
        });
      }
    }
  }
  await prisma.storageLocation.createMany({ data: locationData });
  const locations = await prisma.storageLocation.findMany({
    where: { warehouseId: wh.id },
    include: { rack: { select: { code: true, kind: true } }, zone: { select: { code: true } } },
    orderBy: { code: "asc" },
  });

  await prisma.dock.createMany({ data: preset.docks.map((d) => ({ ...d, warehouseId: wh.id })) });
  const docks = await prisma.dock.findMany({ where: { warehouseId: wh.id }, orderBy: { code: "asc" } });

  // ── Employees
  const employees = await seedEmployees(ctx, wh.id, zoneByCode, scale, index);

  // ── Pallets & inventory
  await seedStock(ctx, wh.id, locations, zoneByCode);

  // ── Vehicles
  const vehicles = await seedVehicles(ctx, wh.id, preset, employees, index);

  // ── Orders, shipments, tasks
  await seedOrdersAndShipments(ctx, wh, preset, docks, vehicles, employees, zoneByCode, scale, index);

  // ── History, alerts, metrics
  await seedMovements(ctx, wh.id, zoneByCode);
  await seedMetrics(ctx, wh.id, scale);
  await seedNotificationsAndActivity(ctx, wh.id, zoneByCode);

  await prisma.simulationState.create({
    data: { warehouseId: wh.id, running: true, seed: 20261113 + index, intervalMs: 4000, lastTickAt: now },
  });
  return wh.id;
}

type ZoneMap = Map<string, { id: string; code: string; name: string }>;

async function seedEmployees(ctx: Ctx, warehouseId: string, zones: ZoneMap, scale: number, index: number) {
  const { prisma, rng, now } = ctx;
  const plan: { role: EmployeeRole; count: number; zone?: string }[] = [
    { role: "SUPERVISOR", count: 2 },
    { role: "FORKLIFT_OPERATOR", count: index === 0 ? 8 : 5, zone: "STA" },
    { role: "PICKER", count: Math.round(6 * scale) || 2, zone: "PCK" },
    { role: "PACKER", count: Math.round(4 * scale) || 2, zone: "PAK" },
    { role: "LOADER", count: Math.round(3 * scale) || 1, zone: "DSP" },
    { role: "DRIVER", count: index === 0 ? 8 : 4 },
    { role: "INVENTORY_CLERK", count: Math.round(2 * scale) || 1, zone: "RCV" },
  ];
  const used = new Set<string>(["Alex Chen", "Sam Patel"]);
  let nameCursor = index * 17 + 3;
  const nextName = () => {
    for (;;) {
      const first = FIRST_NAMES[(nameCursor * 7) % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(nameCursor * 11 + 5) % LAST_NAMES.length]!;
      nameCursor++;
      const full = `${first} ${last}`;
      if (!used.has(full)) {
        used.add(full);
        return { first, last };
      }
    }
  };
  const certs: Record<EmployeeRole, string[]> = {
    SUPERVISOR: ["OSHA 30", "First Aid"],
    FORKLIFT_OPERATOR: ["Forklift Class IV", "Reach Truck"],
    PICKER: ["RF Scanner"],
    PACKER: ["Hazmat Packaging"],
    LOADER: ["Dock Safety"],
    DRIVER: ["CDL Class A"],
    INVENTORY_CLERK: ["Cycle Count", "RF Scanner"],
  };
  const created: { id: string; role: EmployeeRole; name: string; shift: Shift; status: string }[] = [];
  let i = 0;
  for (const p of plan) {
    for (let k = 0; k < p.count; k++) {
      let first: string, last: string, userId: string | undefined;
      if (index === 0 && p.role === "SUPERVISOR" && k === 0) {
        [first, last, userId] = ["Alex", "Chen", ctx.managerUserId];
      } else if (index === 0 && p.role === "FORKLIFT_OPERATOR" && k === 0) {
        [first, last, userId] = ["Sam", "Patel", ctx.operatorUserId];
      } else {
        ({ first, last } = nextName());
      }
      const shift: Shift = i % 7 === 6 ? "NIGHT" : i % 3 === 2 ? "AFTERNOON" : "MORNING";
      const status = shift === "NIGHT" ? "OFF_SHIFT" : i % 13 === 12 ? "ON_LEAVE" : i % 9 === 4 ? "ON_BREAK" : "ON_SHIFT";
      const code = `EMP-${ctx.counters.employee++}`;
      const rate =
        p.role === "PICKER" ? rng.float(95, 140) : p.role === "PACKER" ? rng.float(60, 90) : p.role === "FORKLIFT_OPERATOR" ? rng.float(18, 28) : rng.float(10, 40);
      const e = await prisma.employee.create({
        data: {
          employeeCode: code,
          firstName: first,
          lastName: last,
          email: `${slug(first)}.${slug(last)}${index === 0 ? "" : ".ng"}@waretrack.example`,
          phone: `+1 (555) ${String(200 + i).padStart(3, "0")}-${String(1000 + rng.int(0, 8999)).slice(0, 4)}`,
          role: p.role,
          shift,
          status: status as "ON_SHIFT",
          warehouseId,
          zoneId: p.zone ? zones.get(p.zone)?.id : null,
          userId: userId ?? null,
          hireDate: new Date(now.getTime() - rng.int(120, 2600) * DAY),
          tasksCompleted: rng.int(180, 3200),
          unitsPerHour: Math.round(rate * 10) / 10,
          accuracyRate: Math.round(rng.float(97.4, 99.9) * 10) / 10,
          certifications: certs[p.role],
        },
      });
      created.push({ id: e.id, role: p.role, name: `${first} ${last}`, shift, status });
      i++;
    }
  }
  return created;
}

async function seedStock(
  ctx: Ctx,
  warehouseId: string,
  locations: { id: string; code: string; type: string; column: number; rackId: string | null; zoneId: string; rack: { code: string; kind: string } | null; zone: { code: string } }[],
  zones: ZoneMap,
) {
  const { prisma, rng, now, products } = ctx;
  const chilled = products.filter((p) => p.seed.chilled && !p.seed.lowStock);
  const ambient = products.filter((p) => !p.seed.chilled && !p.seed.lowStock);
  const lowStock = products.filter((p) => p.seed.lowStock);
  const shuffledAmbient = rng.shuffle([...ambient]);

  const pallets: Prisma.PalletCreateManyInput[] = [];
  const lot = () => `L${String(now.getFullYear()).slice(2)}${String(rng.int(1, 12)).padStart(2, "0")}-${rng.int(100, 999)}`;
  const addPallet = (
    product: Ctx["products"][number],
    locationId: string | null,
    qty: number,
    status: PalletStatus,
    receivedAgoMs: number,
  ) => {
    pallets.push({
      code: `PAL-${ctx.counters.pallet++}`,
      warehouseId,
      productId: product.id,
      locationId,
      quantity: qty,
      lot: lot(),
      status,
      grossWeightKg: Math.round((qty * product.seed.weight + 22) * 10) / 10,
      receivedAt: new Date(now.getTime() - receivedAgoMs),
    });
  };

  // group rack locations by rack, then by column
  const byRack = new Map<string, typeof locations>();
  for (const loc of locations) {
    if (!loc.rackId) continue;
    const list = byRack.get(loc.rackId) ?? [];
    list.push(loc);
    byRack.set(loc.rackId, list);
  }
  let ambientCursor = 0;
  let chilledCursor = 0;
  let pickCursor = 0;
  const pickPool = [...lowStock.filter((p) => !p.seed.chilled), ...shuffledAmbient];
  for (const [, rackLocs] of byRack) {
    const zoneCode = rackLocs[0]!.zone.code;
    const shelving = rackLocs[0]!.rack?.kind === "SHELVING";
    const columns = Math.max(...rackLocs.map((l) => l.column)) + 1;
    const colProduct: Ctx["products"][number][] = [];
    for (let c = 0; c < columns; c++) {
      if (shelving) {
        colProduct.push(pickPool[pickCursor++ % pickPool.length]!);
      } else if (zoneCode === "STB") {
        if (c % 2 === 0) chilledCursor++;
        colProduct.push(chilled[chilledCursor % chilled.length]!);
      } else {
        if (c % 2 === 0) ambientCursor++;
        colProduct.push(shuffledAmbient[ambientCursor % shuffledAmbient.length]!);
      }
    }
    const fill = shelving ? 0.78 : zoneCode === "STB" ? 0.64 : 0.74;
    for (const loc of rackLocs) {
      const product = colProduct[loc.column]!;
      if (product.seed.lowStock) {
        // one small carton only, so low-stock alerts are meaningful
        if (shelving && loc.code.endsWith("-1") && !pallets.some((p) => p.productId === product.id)) {
          addPallet(product, loc.id, Math.max(2, Math.floor(product.seed.reorder * 0.35)), "STORED", rng.int(3, 30) * DAY);
        }
        continue;
      }
      if (!rng.chance(fill)) continue;
      const qty = shelving
        ? Math.max(4, Math.round(product.seed.perPallet * 0.18 * rng.float(0.35, 1)))
        : Math.max(6, Math.round(product.seed.perPallet * rng.float(0.45, 1)));
      addPallet(product, loc.id, qty, "STORED", rng.int(2, 75) * DAY);
    }
  }
  // chilled low-stock product goes in STB with a single small pallet
  for (const p of lowStock.filter((x) => x.seed.chilled)) {
    const free = locations.find((l) => l.zone.code === "STB" && l.rackId && !pallets.some((x) => x.locationId === l.id));
    if (free) addPallet(p, free.id, Math.floor(p.seed.reorder * 0.4), "STORED", 9 * DAY);
  }

  const floor = (zone: string) => locations.filter((l) => l.zone.code === zone && l.type === "FLOOR");
  const fill = (zone: string, count: number, status: PalletStatus, pool: Ctx["products"], ageMs: [number, number]) => {
    const slots = floor(zone);
    for (let i = 0; i < Math.min(count, slots.length); i++) {
      const slot = slots[(i * 3) % slots.length]!;
      if (pallets.some((p) => p.locationId === slot.id)) continue;
      const product = pool[(i * 5 + rng.int(0, pool.length - 1)) % pool.length]!;
      const qty = Math.max(6, Math.round(product.seed.perPallet * rng.float(0.5, 1)));
      addPallet(product, slot.id, qty, status, rng.int(ageMs[0], ageMs[1]));
    }
  };
  const packaging = products.filter((p) => p.seed.category === "Packaging" && !p.seed.lowStock);
  fill("RCV", 6, "RECEIVED", ambient, [20 * MIN, 3 * HOUR]);
  fill("DSP", 6, "STAGED", [...ambient, ...chilled], [15 * MIN, 2 * HOUR]);
  fill("PAK", 4, "STAGED", ambient, [10 * MIN, HOUR]);
  fill("RTN", 3, "RECEIVED", ambient, [1 * DAY, 4 * DAY]);
  fill("DMG", 3, "DAMAGED", ambient, [1 * DAY, 6 * DAY]);
  fill("YRD", 7, "STORED", packaging, [3 * DAY, 30 * DAY]);

  await prisma.pallet.createMany({ data: pallets });

  // Aggregate inventory per (zone, product) from physical pallets
  const zoneCodeById = new Map([...zones.values()].map((z) => [z.id, z.code]));
  const locZone = new Map(locations.map((l) => [l.id, l.zoneId]));
  const agg = new Map<string, Prisma.InventoryItemCreateManyInput>();
  for (const p of pallets) {
    if (!p.locationId) continue;
    const zoneId = locZone.get(p.locationId)!;
    const zcode = zoneCodeById.get(zoneId)!;
    if (zcode === "DSP" || zcode === "PAK") continue; // outbound goods, already picked
    const key = `${zoneId}:${p.productId}`;
    const item = agg.get(key) ?? { warehouseId, zoneId, productId: p.productId, quantity: 0, reserved: 0, damaged: 0 };
    if (p.status === "DAMAGED") item.damaged = (item.damaged ?? 0) + p.quantity;
    else item.quantity = (item.quantity ?? 0) + p.quantity;
    agg.set(key, item);
  }
  // Some loose units on pick faces
  for (const item of agg.values()) {
    if (zoneCodeById.get(item.zoneId) === "PCK" && !products.find((x) => x.id === item.productId)?.seed.lowStock) {
      item.quantity = (item.quantity ?? 0) + rng.int(0, 12);
    }
    item.lastCountAt = new Date(now.getTime() - rng.int(1, 40) * DAY);
  }
  await prisma.inventoryItem.createMany({ data: [...agg.values()] });
}

async function seedVehicles(
  ctx: Ctx,
  warehouseId: string,
  preset: WarehousePreset,
  employees: { id: string; role: EmployeeRole; name: string }[],
  index: number,
) {
  const { prisma, rng, now } = ctx;
  const operators = employees.filter((e) => e.role === "FORKLIFT_OPERATOR");
  const drivers = employees.filter((e) => e.role === "DRIVER");
  const charge = preset.site.chargeSpots;
  const park = preset.site.truckParking;
  const forklifts =
    index === 0
      ? [
          { code: "FL-01", type: "FORKLIFT", model: "WT Lift E30", energy: 92 },
          { code: "FL-02", type: "FORKLIFT", model: "WT Lift E30", energy: 78 },
          { code: "FL-03", type: "FORKLIFT", model: "WT Lift E30", energy: 64 },
          { code: "FL-04", type: "FORKLIFT", model: "WT Lift E25", energy: 86 },
          { code: "FL-05", type: "FORKLIFT", model: "WT Lift E25", energy: 51, status: "MAINTENANCE" },
          { code: "FL-06", type: "FORKLIFT", model: "WT Lift E25", energy: 31, status: "CHARGING" },
          { code: "RT-01", type: "REACH_TRUCK", model: "WT Reach R16", energy: 88 },
          { code: "RT-02", type: "REACH_TRUCK", model: "WT Reach R16", energy: 73 },
        ]
      : [
          { code: "FL-11", type: "FORKLIFT", model: "WT Lift E25", energy: 81 },
          { code: "FL-12", type: "FORKLIFT", model: "WT Lift E25", energy: 67 },
          { code: "FL-13", type: "FORKLIFT", model: "WT Lift E30", energy: 44, status: "CHARGING" },
          { code: "RT-11", type: "REACH_TRUCK", model: "WT Reach R16", energy: 90 },
        ];
  const trucks =
    index === 0
      ? ["TRK-2051", "TRK-2063", "TRK-2104", "TRK-2178", "TRK-2219", "TRK-2287"]
      : ["TRK-3011", "TRK-3024", "TRK-3036"];
  const vans = index === 0 ? ["VAN-310", "VAN-318"] : ["VAN-410"];

  const created: { id: string; code: string; type: string }[] = [];
  for (const [i, f] of forklifts.entries()) {
    const spot = charge[i % charge.length]!;
    const v = await prisma.vehicle.create({
      data: {
        code: f.code,
        type: f.type as "FORKLIFT",
        model: f.model,
        status: (f.status ?? "AVAILABLE") as "AVAILABLE",
        energyType: "ELECTRIC",
        energyLevel: f.energy,
        warehouseId,
        operatorId: operators[i % operators.length] && i < operators.length ? operators[i]!.id : null,
        locationLabel: f.status === "MAINTENANCE" ? "Maintenance bay" : "Charging bay",
        posX: spot.x,
        posZ: spot.z,
        heading: spot.heading,
        hoursUsed: rng.int(800, 6400),
        lastServiceAt: new Date(now.getTime() - rng.int(10, 80) * DAY),
        nextServiceDue: new Date(now.getTime() + (f.code === "FL-03" ? 2 : rng.int(8, 60)) * DAY),
      },
    });
    created.push(v);
  }
  for (const [i, code] of trucks.entries()) {
    const spot = park[i % park.length]!;
    const v = await prisma.vehicle.create({
      data: {
        code,
        type: "TRUCK",
        model: i % 2 === 0 ? "WT Hauler 26t" : "WT Hauler 18t",
        registration: `${index === 0 ? "PA" : "OH"}-${rng.int(1, 9)}K${rng.int(1, 9)}-${rng.int(100, 999)}`,
        carrier: "WareTrack Freight",
        energyType: "DIESEL",
        energyLevel: rng.int(45, 96),
        warehouseId,
        operatorId: drivers[i]?.id ?? null,
        locationLabel: "Truck parking",
        posX: spot.x,
        posZ: spot.z,
        heading: spot.heading,
        hoursUsed: rng.int(4000, 22000),
        lastServiceAt: new Date(now.getTime() - rng.int(10, 120) * DAY),
        nextServiceDue: new Date(now.getTime() + rng.int(5, 90) * DAY),
      },
    });
    created.push(v);
  }
  for (const [i, code] of vans.entries()) {
    const spot = park[(trucks.length + i) % park.length]!;
    const v = await prisma.vehicle.create({
      data: {
        code,
        type: "VAN",
        model: "WT Cargo Van 3.5t",
        registration: `${index === 0 ? "PA" : "OH"}-V${rng.int(10, 99)}-${rng.int(100, 999)}`,
        carrier: "WareTrack Freight",
        energyType: i === 0 ? "ELECTRIC" : "DIESEL",
        energyLevel: rng.int(40, 95),
        status: index === 0 && i === 1 ? "MAINTENANCE" : "AVAILABLE",
        warehouseId,
        operatorId: drivers[trucks.length + i]?.id ?? null,
        locationLabel: index === 0 && i === 1 ? "Workshop" : "Truck parking",
        posX: spot.x,
        posZ: spot.z,
        heading: spot.heading,
        hoursUsed: rng.int(1500, 9000),
        lastServiceAt: new Date(now.getTime() - rng.int(10, 120) * DAY),
        nextServiceDue: new Date(now.getTime() + rng.int(5, 90) * DAY),
      },
    });
    created.push(v);
  }

  // maintenance history
  const records: Prisma.MaintenanceRecordCreateManyInput[] = [];
  const types = [
    ["Preventive service", "250-hour inspection, fluids and filters"],
    ["Battery check", "Cell balancing and electrolyte check"],
    ["Tyre replacement", "Replaced worn tyres"],
    ["Brake service", "Brake pads and adjustment"],
    ["Safety inspection", "Annual safety certification"],
  ] as const;
  for (const v of created) {
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      const [type, description] = rng.pick(types);
      records.push({
        vehicleId: v.id,
        type,
        description,
        cost: Math.round(rng.float(80, v.type === "TRUCK" ? 1800 : 650)),
        status: "COMPLETED",
        performedBy: rng.pick(["In-house workshop", "LiftCare Services", "FleetPro Mechanics"]),
        performedAt: new Date(now.getTime() - rng.int(15, 360) * DAY),
      });
    }
    if (v.code === "FL-05" || v.code === "VAN-318") {
      records.push({
        vehicleId: v.id,
        type: v.code === "FL-05" ? "Hydraulic repair" : "Gearbox inspection",
        description: v.code === "FL-05" ? "Mast hydraulic leak — seals on order" : "Grinding noise in 3rd gear reported by driver",
        cost: v.code === "FL-05" ? 420 : 0,
        status: "IN_PROGRESS",
        performedBy: "In-house workshop",
        performedAt: new Date(now.getTime() - 5 * HOUR),
      });
    }
  }
  await prisma.maintenanceRecord.createMany({ data: records });
  return created;
}

async function seedOrdersAndShipments(
  ctx: Ctx,
  wh: { id: string; city: string; code: string },
  preset: WarehousePreset,
  docks: { id: string; code: string; name: string; direction: string; posX: number; posZ: number }[],
  vehicles: { id: string; code: string; type: string }[],
  employees: { id: string; role: EmployeeRole; name: string }[],
  zones: ZoneMap,
  scale: number,
  index: number,
) {
  const { prisma, rng, now, products, customers } = ctx;
  const orderable = products.filter((p) => !p.seed.lowStock);
  const totalOrders = Math.round(150 * scale);
  const pipeline: [OrderStatus, number][] = [
    ["PENDING", Math.round(9 * scale) || 3],
    ["PROCESSING", Math.round(6 * scale) || 2],
    ["PICKING", Math.round(5 * scale) || 2],
    ["PACKING", Math.round(4 * scale) || 1],
    ["READY_FOR_DISPATCH", Math.round(4 * scale) || 2],
    ["DISPATCHED", Math.round(4 * scale) || 2],
  ];
  const priorities: Priority[] = ["NORMAL", "NORMAL", "NORMAL", "HIGH", "NORMAL", "LOW", "HIGH", "NORMAL", "URGENT", "NORMAL"];

  type OrderPlan = { status: OrderStatus; createdAt: Date };
  const plans: OrderPlan[] = [];
  let ageMin = 6;
  for (const [status, count] of pipeline) {
    for (let i = 0; i < count; i++) {
      plans.push({ status, createdAt: new Date(now.getTime() - ageMin * MIN) });
      ageMin += rng.int(18, 55);
    }
  }
  const remaining = totalOrders - plans.length;
  for (let i = 0; i < remaining; i++) {
    const created = new Date(now.getTime() - (1.2 * DAY + (i / remaining) * 29 * DAY) - rng.int(0, 600) * MIN);
    plans.push({ status: i % 37 === 11 ? "CANCELLED" : "DELIVERED", createdAt: created });
  }

  const orders: { id: string; number: string; status: OrderStatus; createdAt: Date; customer: string; city: string; units: number }[] = [];
  for (const [i, plan] of plans.entries()) {
    const customer = customers[(i * 5 + index * 3) % customers.length]!;
    const itemCount = rng.int(1, 4);
    const chosen = new Set<string>();
    const items: { productId: string; quantity: number; pickedQty: number }[] = [];
    for (let k = 0; k < itemCount; k++) {
      const p = orderable[rng.int(0, orderable.length - 1)]!;
      if (chosen.has(p.id)) continue;
      chosen.add(p.id);
      const qty = rng.int(1, 8) * (p.seed.perPallet > 300 ? 10 : p.seed.perPallet > 90 ? 4 : 1);
      const picked =
        plan.status === "PICKING" ? Math.floor(qty / 2) : ["PACKING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED"].includes(plan.status) ? qty : 0;
      items.push({ productId: p.id, quantity: qty, pickedQty: picked });
    }
    const overdue = plan.status === "PENDING" && i >= 2 && i <= 3;
    const required = overdue
      ? new Date(now.getTime() - rng.int(30, 160) * MIN)
      : new Date(plan.createdAt.getTime() + rng.int(18, 60) * HOUR);
    const number = `SO-${ctx.counters.order++}`;
    const order = await prisma.order.create({
      data: {
        number,
        warehouseId: wh.id,
        customerId: customer.id,
        priority: overdue ? "URGENT" : priorities[i % priorities.length]!,
        status: plan.status,
        createdAt: plan.createdAt,
        requiredDispatchAt: required,
        dispatchedAt: ["DISPATCHED", "DELIVERED"].includes(plan.status) ? new Date(plan.createdAt.getTime() + rng.int(10, 30) * HOUR) : null,
        notes: i % 11 === 3 ? "Deliver to rear loading entrance." : null,
        items: { create: items },
      },
    });
    orders.push({
      id: order.id,
      number,
      status: plan.status,
      createdAt: plan.createdAt,
      customer: customer.name,
      city: customer.city ?? "Philadelphia, PA",
      units: items.reduce((s, x) => s + x.quantity, 0),
    });
  }

  // Reserve stock for orders that are being processed
  const open = await prisma.orderItem.findMany({
    where: { order: { warehouseId: wh.id, status: { in: ["PROCESSING", "PICKING"] } } },
  });
  for (const item of open) {
    const remainingQty = item.quantity - item.pickedQty;
    const inv = await prisma.inventoryItem.findFirst({
      where: { warehouseId: wh.id, productId: item.productId },
      orderBy: { quantity: "desc" },
    });
    if (inv) {
      await prisma.inventoryItem.update({
        where: { id: inv.id },
        data: { reserved: Math.min(inv.quantity, inv.reserved + remainingQty) },
      });
    }
  }

  // ── Shipments
  const trucks = vehicles.filter((v) => v.type === "TRUCK");
  const vans = vehicles.filter((v) => v.type === "VAN");
  const drivers = employees.filter((e) => e.role === "DRIVER");
  const outboundDocks = docks.filter((d) => d.direction === "OUTBOUND");
  const inboundDocks = docks.filter((d) => d.direction === "INBOUND");
  const origin = wh.city;

  const shipmentEvents: Prisma.ShipmentEventCreateManyInput[] = [];
  const makeShipment = async (s: {
    direction: "INBOUND" | "OUTBOUND";
    status: ShipmentStatus;
    carrier: string;
    destination: string;
    originName?: string;
    vehicleId?: string | null;
    driverId?: string | null;
    dockId?: string | null;
    scheduledAt: Date;
    eta: Date;
    departedAt?: Date | null;
    deliveredAt?: Date | null;
    loadingProgress?: number;
    palletCount?: number;
    weightKg?: number;
    orderIds?: string[];
    simulated?: boolean;
  }) => {
    const map = CITY_MAP[s.direction === "OUTBOUND" ? s.destination : (s.originName ?? s.destination)] ?? { x: 0.5, y: 0.5 };
    const trackingNumber = `SHP-${ctx.counters.shipment++}`;
    let routeProgress = 0;
    if (s.status === "DELIVERED") routeProgress = 1;
    else if ((s.status === "IN_TRANSIT" || s.status === "DELAYED") && s.departedAt) {
      routeProgress = Math.min(0.95, (now.getTime() - s.departedAt.getTime()) / Math.max(1, s.eta.getTime() - s.departedAt.getTime()));
      if (s.status === "DELAYED") routeProgress = Math.min(routeProgress, 0.82);
    }
    const sh = await prisma.shipment.create({
      data: {
        trackingNumber,
        warehouseId: wh.id,
        direction: s.direction,
        status: s.status,
        carrier: s.carrier,
        origin: s.direction === "OUTBOUND" ? origin : (s.originName ?? s.destination),
        destination: s.direction === "OUTBOUND" ? s.destination : origin,
        destMapX: map.x,
        destMapY: map.y,
        routeProgress,
        loadingProgress: s.loadingProgress ?? (["READY", "IN_TRANSIT", "DELAYED", "DELIVERED"].includes(s.status) ? 100 : 0),
        weightKg: s.weightKg ?? Math.round(rng.float(2400, 14000)),
        palletCount: s.palletCount ?? rng.int(6, 22),
        vehicleId: s.vehicleId ?? null,
        driverId: s.driverId ?? null,
        dockId: s.dockId ?? null,
        scheduledAt: s.scheduledAt,
        eta: s.eta,
        departedAt: s.departedAt ?? null,
        deliveredAt: s.deliveredAt ?? null,
        simulated: s.simulated ?? false,
        createdAt: new Date(s.scheduledAt.getTime() - 2 * HOUR),
      },
    });
    if (s.orderIds?.length) {
      await prisma.order.updateMany({ where: { id: { in: s.orderIds } }, data: { shipmentId: sh.id } });
    }
    // timeline
    const t0 = new Date(s.scheduledAt.getTime() - 2 * HOUR);
    shipmentEvents.push({ shipmentId: sh.id, status: "PLANNED", message: "Shipment planned", location: s.direction === "OUTBOUND" ? origin : (s.originName ?? s.destination), createdAt: t0 });
    if (s.status !== "PLANNED") {
      if (s.dockId || ["LOADING", "READY", "IN_TRANSIT", "DELAYED", "DELIVERED"].includes(s.status)) {
        shipmentEvents.push({ shipmentId: sh.id, status: "AT_DOCK", message: "Vehicle arrived at dock", location: origin, createdAt: new Date(s.scheduledAt.getTime() - 40 * MIN) });
      }
      if (["LOADING", "READY", "IN_TRANSIT", "DELAYED", "DELIVERED"].includes(s.status)) {
        shipmentEvents.push({ shipmentId: sh.id, status: "LOADING", message: s.direction === "INBOUND" ? "Unloading started" : "Loading started", location: origin, createdAt: new Date(s.scheduledAt.getTime() - 25 * MIN) });
      }
      if (s.departedAt) {
        shipmentEvents.push({ shipmentId: sh.id, status: "IN_TRANSIT", message: `Departed towards ${s.destination}`, location: origin, createdAt: s.departedAt });
      }
      if (s.status === "DELAYED") {
        shipmentEvents.push({ shipmentId: sh.id, status: "DELAYED", message: "Carrier reported traffic delay on route", location: "En route", createdAt: new Date(now.getTime() - 25 * MIN) });
      }
      if (s.deliveredAt) {
        shipmentEvents.push({ shipmentId: sh.id, status: "DELIVERED", message: s.direction === "INBOUND" ? "Received in full" : "Delivered — proof of delivery captured", location: s.destination, createdAt: s.deliveredAt });
      }
    }
    return sh;
  };

  // Historical delivered shipments grouping delivered orders
  const delivered = orders.filter((o) => o.status === "DELIVERED").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (let i = 0; i < delivered.length; i += 3) {
    const group = delivered.slice(i, i + 3);
    const first = group[0]!;
    const scheduledAt = new Date(first.createdAt.getTime() + rng.int(12, 26) * HOUR);
    const departedAt = new Date(scheduledAt.getTime() + rng.int(10, 50) * MIN);
    const eta = new Date(departedAt.getTime() + rng.int(3, 9) * HOUR);
    const late = i % 17 === 5;
    const deliveredAt = new Date(eta.getTime() + (late ? rng.int(30, 140) : -rng.int(0, 40)) * MIN);
    if (deliveredAt.getTime() > now.getTime() - HOUR) continue;
    await makeShipment({
      direction: "OUTBOUND",
      status: "DELIVERED",
      carrier: i % 4 === 0 ? CARRIERS[1]! : CARRIERS[0]!,
      destination: first.city,
      vehicleId: trucks[(i / 3) % trucks.length]?.id,
      driverId: drivers[(i / 3) % drivers.length]?.id,
      scheduledAt,
      eta,
      departedAt,
      deliveredAt,
      orderIds: group.map((o) => o.id),
      palletCount: rng.int(4, 18),
    });
    await prisma.order.updateMany({
      where: { id: { in: group.map((o) => o.id) } },
      data: { dispatchedAt: departedAt },
    });
  }

  const ready = orders.filter((o) => o.status === "READY_FOR_DISPATCH");
  const dispatched = orders.filter((o) => o.status === "DISPATCHED");
  const truckAt = (i: number) => trucks[i % trucks.length]!;

  // Active outbound: loading + at dock
  const loadingDock = outboundDocks[0]!;
  await makeShipment({
    direction: "OUTBOUND",
    status: "LOADING",
    carrier: CARRIERS[0]!,
    destination: index === 0 ? "Philadelphia, PA" : "Cleveland, OH",
    vehicleId: truckAt(0).id,
    driverId: drivers[0]?.id,
    dockId: loadingDock.id,
    scheduledAt: new Date(now.getTime() + 20 * MIN),
    eta: new Date(now.getTime() + 95 * MIN),
    loadingProgress: 34,
    palletCount: 2,
    weightKg: 1960,
    orderIds: ready.slice(0, Math.max(1, ready.length - 1)).map((o) => o.id),
  });
  await prisma.dock.update({ where: { id: loadingDock.id }, data: { status: "OCCUPIED" } });
  await prisma.vehicle.update({
    where: { id: truckAt(0).id },
    data: { status: "IN_USE", locationLabel: `${loadingDock.name} (loading)`, posX: loadingDock.posX + 8, posZ: loadingDock.posZ, heading: -Math.PI / 2 },
  });

  if (outboundDocks[1]) {
    const d = outboundDocks[1];
    await makeShipment({
      direction: "OUTBOUND",
      status: "AT_DOCK",
      carrier: CARRIERS[0]!,
      destination: index === 0 ? "Pittsburgh, PA" : "Columbus, OH",
      vehicleId: truckAt(1).id,
      driverId: drivers[1]?.id,
      dockId: d.id,
      scheduledAt: new Date(now.getTime() + 55 * MIN),
      eta: new Date(now.getTime() + 6 * HOUR),
      palletCount: 0,
      weightKg: 0,
      orderIds: ready.slice(-1).map((o) => o.id),
    });
    await prisma.dock.update({ where: { id: d.id }, data: { status: "OCCUPIED" } });
    await prisma.vehicle.update({
      where: { id: truckAt(1).id },
      data: { status: "IN_USE", locationLabel: `${d.name} (at dock)`, posX: d.posX + 8, posZ: d.posZ, heading: -Math.PI / 2 },
    });
  }

  // In transit (one delayed)
  const transitTargets = index === 0 ? ["New York, NY", "Baltimore, MD"] : ["Pittsburgh, PA"];
  for (const [k, dest] of transitTargets.entries()) {
    const truck = truckAt(2 + k);
    const departedAt = new Date(now.getTime() - (k === 0 ? 70 : 150) * MIN);
    const delayed = k === 1;
    await makeShipment({
      direction: "OUTBOUND",
      status: delayed ? "DELAYED" : "IN_TRANSIT",
      carrier: CARRIERS[0]!,
      destination: dest,
      vehicleId: truck.id,
      driverId: drivers[2 + k]?.id,
      scheduledAt: new Date(departedAt.getTime() - 20 * MIN),
      departedAt,
      eta: delayed ? new Date(now.getTime() - 12 * MIN) : new Date(now.getTime() + 58 * MIN),
      orderIds: dispatched.slice(k * 2, k * 2 + 2).map((o) => o.id),
    });
    await prisma.vehicle.update({
      where: { id: truck.id },
      data: { status: "IN_USE", onSite: false, locationLabel: `En route to ${dest}` },
    });
  }
  if (vans[0] && index === 0) {
    const departedAt = new Date(now.getTime() - 35 * MIN);
    await makeShipment({
      direction: "OUTBOUND",
      status: "IN_TRANSIT",
      carrier: CARRIERS[0]!,
      destination: "Wilmington, DE",
      vehicleId: vans[0].id,
      driverId: drivers[6]?.id,
      scheduledAt: new Date(departedAt.getTime() - 15 * MIN),
      departedAt,
      eta: new Date(now.getTime() + 25 * MIN),
      palletCount: 3,
      weightKg: 860,
      orderIds: dispatched.slice(4).map((o) => o.id),
    });
    await prisma.vehicle.update({ where: { id: vans[0].id }, data: { status: "IN_USE", onSite: false, locationLabel: "En route to Wilmington, DE" } });
  }

  // Planned outbound for tomorrow
  await makeShipment({
    direction: "OUTBOUND",
    status: "PLANNED",
    carrier: CARRIERS[2]!,
    destination: index === 0 ? "Boston, MA" : "Richmond, VA",
    scheduledAt: new Date(now.getTime() + 5 * HOUR),
    eta: new Date(now.getTime() + 11 * HOUR),
    palletCount: 0,
    weightKg: 0,
  });

  // Inbound: unloading at dock, en route, planned
  const unloadDock = inboundDocks[1] ?? inboundDocks[0]!;
  await makeShipment({
    direction: "INBOUND",
    status: "LOADING",
    carrier: CARRIERS[1]!,
    destination: origin,
    originName: index === 0 ? "Newark, NJ" : "Cleveland, OH",
    dockId: unloadDock.id,
    scheduledAt: new Date(now.getTime() - 30 * MIN),
    eta: new Date(now.getTime() - 35 * MIN),
    loadingProgress: 40,
    palletCount: 10,
  });
  await prisma.dock.update({ where: { id: unloadDock.id }, data: { status: "OCCUPIED" } });
  await makeShipment({
    direction: "INBOUND",
    status: "IN_TRANSIT",
    carrier: CARRIERS[3]!,
    destination: origin,
    originName: index === 0 ? "Hartford, CT" : "Pittsburgh, PA",
    scheduledAt: new Date(now.getTime() + 40 * MIN),
    departedAt: new Date(now.getTime() - 2 * HOUR),
    eta: new Date(now.getTime() + 40 * MIN),
    palletCount: 14,
  });
  await makeShipment({
    direction: "INBOUND",
    status: "PLANNED",
    carrier: CARRIERS[2]!,
    destination: origin,
    originName: index === 0 ? "Allentown, PA" : "Columbus, OH",
    scheduledAt: new Date(now.getTime() + 3 * HOUR),
    eta: new Date(now.getTime() + 3 * HOUR),
    palletCount: 8,
  });
  // one dock under maintenance at the main site
  if (index === 0 && inboundDocks[2]) {
    await prisma.dock.update({ where: { id: inboundDocks[2].id }, data: { status: "MAINTENANCE" } });
  }

  await prisma.shipmentEvent.createMany({ data: shipmentEvents });

  // ── Tasks: open picks for orders in PICKING, plus completed history
  const pickers = employees.filter((e) => e.role === "PICKER");
  const operators = employees.filter((e) => e.role === "FORKLIFT_OPERATOR");
  const tasks: Prisma.TaskCreateManyInput[] = [];
  for (const [i, o] of orders.filter((x) => x.status === "PICKING").entries()) {
    tasks.push({
      number: `TSK-${ctx.counters.task++}`,
      warehouseId: wh.id,
      type: "PICK",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      description: `Pick ${o.units} units for ${o.number} (${o.customer})`,
      progress: 50,
      assigneeId: pickers[i % pickers.length]?.id,
      orderId: o.id,
      startedAt: new Date(now.getTime() - rng.int(5, 25) * MIN),
      dueAt: new Date(now.getTime() + 2 * HOUR),
    });
  }
  const forkliftVehicles = vehicles.filter((v) => v.type === "FORKLIFT" || v.type === "REACH_TRUCK");
  const historyTypes = ["PUTAWAY", "PICK", "LOAD", "TRANSFER", "UNLOAD", "CYCLE_COUNT", "REPLENISH"] as const;
  const historyCount = Math.round(90 * scale);
  for (let i = 0; i < historyCount; i++) {
    const type = historyTypes[i % historyTypes.length]!;
    const started = new Date(now.getTime() - rng.int(30, 7 * 24 * 60) * MIN);
    const usesForklift = type !== "PICK" && type !== "CYCLE_COUNT";
    tasks.push({
      number: `TSK-${ctx.counters.task++}`,
      warehouseId: wh.id,
      type,
      status: i % 23 === 7 ? "CANCELLED" : "COMPLETED",
      priority: i % 9 === 0 ? "HIGH" : "NORMAL",
      description:
        type === "PUTAWAY"
          ? "Put away received pallet to storage"
          : type === "PICK"
            ? "Pick order lines"
            : type === "LOAD"
              ? "Load staged pallet onto outbound trailer"
              : type === "TRANSFER"
                ? "Transfer pallet between zones"
                : type === "UNLOAD"
                  ? "Unload inbound trailer"
                  : type === "REPLENISH"
                    ? "Replenish pick face from reserve"
                    : "Cycle count rack bay",
      progress: 100,
      assigneeId: usesForklift ? operators[i % operators.length]?.id : pickers[i % pickers.length]?.id,
      vehicleId: usesForklift ? forkliftVehicles[i % forkliftVehicles.length]?.id : null,
      startedAt: started,
      completedAt: new Date(started.getTime() + rng.int(4, 35) * MIN),
      createdAt: new Date(started.getTime() - rng.int(1, 30) * MIN),
    });
  }
  await prisma.task.createMany({ data: tasks });
  void zones;
  void preset;
}

async function seedMovements(ctx: Ctx, warehouseId: string, zones: ZoneMap) {
  const { prisma, rng, now, products } = ctx;
  const zoneIds = [...zones.values()];
  const storage = zoneIds.filter((z) => ["STA", "STB", "PCK", "RCV"].includes(z.code));
  const rows: Prisma.StockMovementCreateManyInput[] = [];
  const types = ["RECEIPT", "PUTAWAY", "PICK", "PICK", "TRANSFER", "ADJUSTMENT", "PICK", "RECEIPT"] as const;
  for (const p of products) {
    const n = rng.int(4, 9);
    for (let i = 0; i < n; i++) {
      const type = types[(i + p.sku.length) % types.length]!;
      const from = rng.pick(storage);
      const to = rng.pick(storage);
      const qty =
        type === "ADJUSTMENT"
          ? rng.int(-6, 6) || 2
          : type === "PICK"
            ? -rng.int(2, 40)
            : rng.int(10, Math.max(12, p.seed.perPallet));
      rows.push({
        warehouseId,
        productId: p.id,
        type,
        quantity: qty,
        fromZoneId: type === "RECEIPT" ? null : from.id,
        toZoneId: type === "PICK" ? null : to.id,
        reference: type === "RECEIPT" ? `PO-${rng.int(4000, 4999)}` : type === "PICK" ? `SO-${rng.int(10000, 10230)}` : null,
        note: type === "ADJUSTMENT" ? "Cycle count variance" : null,
        simulated: true,
        createdAt: new Date(now.getTime() - rng.int(60, 60 * 24 * 60) * MIN),
      });
    }
  }
  await prisma.stockMovement.createMany({ data: rows });
}

async function seedMetrics(ctx: Ctx, warehouseId: string, scale: number) {
  const { prisma, now } = ctx;
  const rng = createRng(4242 + Math.round(scale * 100));
  const inv = await prisma.inventoryItem.aggregate({ where: { warehouseId }, _sum: { quantity: true } });
  const unitsNow = inv._sum.quantity ?? 20000;
  const [occupiedNow, capacityNow] = await Promise.all([
    prisma.storageLocation.count({ where: { warehouseId, pallet: { isNot: null } } }),
    prisma.storageLocation.count({ where: { warehouseId } }),
  ]);
  const utilizationNow = capacityNow ? (occupiedNow / capacityNow) * 100 : 70;
  // walk utilisation backwards from today's real value so "vs yesterday" is believable
  const utilSeries: number[] = [];
  let u = utilizationNow;
  for (let d = 0; d < ctx.historyDays; d++) {
    utilSeries.push(u);
    u = Math.min(91, Math.max(52, u + rng.float(-1.1, 1.1)));
  }
  const rows: Prisma.MetricSnapshotCreateManyInput[] = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let invValue = 2_350_000 * scale;
  for (let d = ctx.historyDays; d >= 1; d--) {
    const date = new Date(today.getTime() - d * DAY);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + (ctx.historyDays - d) * 0.0011;
    const season = 1 + 0.08 * Math.sin(((ctx.historyDays - d) / 30) * Math.PI);
    const base = 210 * scale * trend * season * (weekend ? 0.42 : 1) * rng.float(0.9, 1.1);
    const ordersReceived = Math.round(base);
    const ordersShipped = Math.round(base * rng.float(0.93, 1.03));
    const unitsPicked = Math.round(ordersShipped * rng.float(11, 16));
    const unitsReceived = Math.round(unitsPicked * rng.float(0.85, 1.15));
    invValue = Math.max(1_400_000 * scale, invValue + rng.float(-35_000, 38_000) * scale);
    const laborHours = Math.round((weekend ? 90 : 205) * scale * rng.float(0.92, 1.08));
    rows.push({
      warehouseId,
      date,
      ordersReceived,
      ordersShipped,
      unitsPicked,
      unitsReceived,
      pickAccuracy: Math.round(rng.float(98.4, 99.85) * 100) / 100,
      utilization: Math.round(utilSeries[d - 1]! * 10) / 10,
      onTimeRate: Math.round(rng.float(92.5, 98.8) * 10) / 10,
      inventoryValue: Math.round(invValue),
      operatingCost: Math.round(laborHours * 31.5 + 3800 * scale + unitsPicked * 0.12),
      laborHours,
      avgDockMinutes: Math.round(rng.float(31, 56) * 10) / 10,
      inventoryTurnover: Math.round(rng.float(7.4, 9.6) * 100) / 100,
      unitsOnHand: Math.round(unitsNow * (1 + (d / ctx.historyDays) * 0.06) * rng.float(0.98, 1.02)),
      ordersBacklog: Math.round(28 * scale * rng.float(0.7, 1.3)),
      trucksOnSite: Math.round(rng.float(1.5, 4.5) * scale + 1),
      activeOperations: Math.round(rng.float(4, 11) * scale + 1),
      inventoryAccuracy: Math.round(rng.float(98.9, 99.7) * 100) / 100,
      simulated: true,
    });
  }
  await prisma.metricSnapshot.createMany({ data: rows });
}

async function seedNotificationsAndActivity(ctx: Ctx, warehouseId: string, zones: ZoneMap) {
  const { prisma, now } = ctx;
  const low = await prisma.product.findMany({
    where: { sku: { in: PRODUCTS.filter((p) => p.lowStock).map((p) => p.sku) } },
    select: { id: true, name: true, sku: true, reorderLevel: true },
  });
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const day = now.toISOString().slice(0, 10);
  for (const [i, p] of low.entries()) {
    notifications.push({
      warehouseId,
      category: "INVENTORY",
      priority: i === 0 ? "HIGH" : "MEDIUM",
      title: `Low stock: ${p.name}`,
      message: `${p.sku} is below its reorder level of ${p.reorderLevel} units.`,
      link: `/inventory?q=${encodeURIComponent(p.sku)}`,
      entityType: "Product",
      entityId: p.id,
      dedupeKey: `low-stock:${p.id}:${day}`,
      createdAt: new Date(now.getTime() - (i + 1) * 47 * MIN),
    });
  }
  const delayed = await prisma.shipment.findFirst({ where: { warehouseId, status: "DELAYED" } });
  if (delayed) {
    notifications.push({
      warehouseId,
      category: "SHIPMENT",
      priority: "HIGH",
      title: `Shipment ${delayed.trackingNumber} delayed`,
      message: `Carrier reported a delay en route to ${delayed.destination}. Customer ETA at risk.`,
      link: `/shipments?id=${delayed.id}`,
      entityType: "Shipment",
      entityId: delayed.id,
      dedupeKey: `delayed:${delayed.id}`,
      createdAt: new Date(now.getTime() - 25 * MIN),
    });
  }
  const maint = await prisma.vehicle.findMany({ where: { warehouseId, status: "MAINTENANCE" } });
  for (const v of maint) {
    notifications.push({
      warehouseId,
      category: "FLEET",
      priority: "MEDIUM",
      title: `${v.code} in maintenance`,
      message: `${v.model} ${v.code} is out of operation pending repair.`,
      link: `/fleet?id=${v.id}`,
      entityType: "Vehicle",
      entityId: v.id,
      dedupeKey: `maintenance:${v.id}`,
      createdAt: new Date(now.getTime() - 5 * HOUR),
    });
  }
  const due = await prisma.vehicle.findFirst({ where: { warehouseId, code: "FL-03" } });
  if (due) {
    notifications.push({
      warehouseId,
      category: "FLEET",
      priority: "LOW",
      title: "FL-03 service due in 2 days",
      message: "Schedule the 250-hour preventive service to avoid downtime.",
      link: `/fleet?id=${due.id}`,
      entityType: "Vehicle",
      entityId: due.id,
      dedupeKey: `service-due:${due.id}`,
      createdAt: new Date(now.getTime() - 9 * HOUR),
    });
  }
  const overdue = await prisma.order.findMany({ where: { warehouseId, status: "PENDING", requiredDispatchAt: { lt: now } } });
  for (const o of overdue) {
    notifications.push({
      warehouseId,
      category: "ORDER",
      priority: "HIGH",
      title: `Order ${o.number} awaiting processing`,
      message: "Required dispatch time has passed and the order has not been released for picking.",
      link: `/orders?id=${o.id}`,
      entityType: "Order",
      entityId: o.id,
      dedupeKey: `overdue:${o.id}`,
      createdAt: new Date(o.requiredDispatchAt.getTime() + 2 * MIN),
    });
  }
  const dmg = zones.get("DMG");
  if (dmg) {
    const p = await prisma.pallet.findFirst({ where: { warehouseId, status: "DAMAGED" }, include: { product: true } });
    if (p) {
      notifications.push({
        warehouseId,
        category: "INVENTORY",
        priority: "MEDIUM",
        title: `Damaged goods reported — ${p.code}`,
        message: `${p.quantity} × ${p.product.name} moved to Damaged Goods for inspection.`,
        link: `/inventory?q=${encodeURIComponent(p.product.sku)}`,
        entityType: "Pallet",
        entityId: p.id,
        dedupeKey: `damaged:${p.id}`,
        createdAt: new Date(now.getTime() - 26 * HOUR),
      });
    }
  }
  notifications.push({
    warehouseId,
    category: "SYSTEM",
    priority: "LOW",
    title: "Demo simulation active",
    message: "Simulated operations are running for this warehouse. Simulated records are labelled SIM.",
    link: "/warehouse",
    dedupeKey: "sim-started",
    simulated: true,
    createdAt: new Date(now.getTime() - 3 * DAY),
  });
  await prisma.notification.createMany({ data: notifications, skipDuplicates: true });

  // Mark older ones as read for the manager to show read/unread states
  const old = await prisma.notification.findMany({ where: { warehouseId, createdAt: { lt: new Date(now.getTime() - 8 * HOUR) } } });
  await prisma.notificationRead.createMany({
    data: old.map((n) => ({ notificationId: n.id, userId: ctx.managerUserId })),
    skipDuplicates: true,
  });

  // Activity feed
  const recentTasks = await prisma.task.findMany({
    where: { warehouseId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 14,
    include: { vehicle: true, assignee: true },
  });
  const activity: Prisma.ActivityEventCreateManyInput[] = recentTasks.map((t) => ({
    warehouseId,
    type: `task.${t.type.toLowerCase()}`,
    message: `${t.number} ${t.description.toLowerCase()} completed${t.vehicle ? ` with ${t.vehicle.code}` : ""}`,
    entityType: "Task",
    entityId: t.id,
    actorName: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : null,
    simulated: true,
    createdAt: t.completedAt ?? now,
  }));
  const ships = await prisma.shipment.findMany({ where: { warehouseId, status: { in: ["IN_TRANSIT", "DELAYED", "LOADING"] } }, include: { vehicle: true, dock: true } });
  for (const s of ships) {
    activity.push({
      warehouseId,
      type: s.status === "LOADING" ? "shipment.loading" : "shipment.departed",
      message:
        s.status === "LOADING"
          ? `${s.direction === "INBOUND" ? "Unloading" : "Loading"} ${s.trackingNumber} at ${s.dock?.name ?? "dock"}`
          : `${s.vehicle?.code ?? s.carrier} departed with ${s.trackingNumber} to ${s.destination}`,
      entityType: "Shipment",
      entityId: s.id,
      simulated: true,
      createdAt: s.departedAt ?? new Date(now.getTime() - 20 * MIN),
    });
  }
  await prisma.activityEvent.createMany({ data: activity });
}
