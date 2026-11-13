import type { Db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { ensureTodaySnapshot, todayUtc } from "@/server/simulation/engine";

export type AnalyticsFilter = {
  days: number;
  category?: string;
  operation?: "RECEIPT" | "PUTAWAY" | "TRANSFER" | "PICK" | "ADJUSTMENT" | "DAMAGE" | "RETURN" | "DISPATCH";
};

const DAY = 86_400_000;

function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday
  return new Date(x.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export async function getAnalytics(db: Db, warehouseId: string, f: AnalyticsFilter) {
  await ensureTodaySnapshot(db, warehouseId);
  const to = todayUtc();
  const from = new Date(to.getTime() - (f.days - 1) * DAY);

  // ── Daily KPI history (seeded demo history + today's live simulation)
  const snaps = await db.metricSnapshot.findMany({ where: { warehouseId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
  const daily = snaps.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    ordersReceived: s.ordersReceived,
    ordersShipped: s.ordersShipped,
    unitsPicked: s.unitsPicked,
    unitsReceived: s.unitsReceived,
    utilization: s.utilization,
    onTimeRate: s.onTimeRate,
    inventoryTurnover: s.inventoryTurnover,
    operatingCost: s.operatingCost,
    laborHours: s.laborHours,
    pickAccuracy: s.pickAccuracy,
    avgDockMinutes: s.avgDockMinutes,
    unitsPerLaborHour: s.laborHours ? Math.round((s.unitsPicked / s.laborHours) * 10) / 10 : 0,
    costPerOrder: s.ordersShipped ? Math.round((s.operatingCost / s.ordersShipped) * 100) / 100 : 0,
  }));

  // ── Recorded stock movements (real rows), filtered by category and operation type
  const catFilter = f.category ? Prisma.sql`AND p.category = ${f.category}` : Prisma.empty;
  const opFilter = f.operation ? Prisma.sql`AND m.type = ${f.operation}::"MovementType"` : Prisma.empty;
  const movementRows = await db.$queryRaw<{ week: Date; type: string; units: number; count: number }[]>`
    SELECT date_trunc('week', m."createdAt") AS week, m.type::text AS type,
           SUM(ABS(m.quantity))::int AS units, COUNT(*)::int AS count
    FROM "StockMovement" m JOIN "Product" p ON p.id = m."productId"
    WHERE m."warehouseId" = ${warehouseId} AND m."createdAt" >= ${from} ${catFilter} ${opFilter}
    GROUP BY 1, 2 ORDER BY 1`;
  const movementTypes = ["RECEIPT", "PICK", "TRANSFER", "ADJUSTMENT", "DAMAGE"] as const;
  const weeks = new Map<string, Record<string, number | string>>();
  for (const r of movementRows) {
    const key = r.week.toISOString().slice(0, 10);
    const row = weeks.get(key) ?? { week: key, ...Object.fromEntries(movementTypes.map((t) => [t, 0])), OTHER: 0 };
    const bucket = (movementTypes as readonly string[]).includes(r.type) ? r.type : "OTHER";
    row[bucket] = (row[bucket] as number) + r.units;
    weeks.set(key, row);
  }

  const byCategory = await db.$queryRaw<{ category: string; units: number }[]>`
    SELECT p.category, SUM(ABS(m.quantity))::int AS units
    FROM "StockMovement" m JOIN "Product" p ON p.id = m."productId"
    WHERE m."warehouseId" = ${warehouseId} AND m."createdAt" >= ${from}
      AND m.type = ${f.operation ?? "PICK"}::"MovementType" ${catFilter}
    GROUP BY 1 ORDER BY 2 DESC`;

  // ── Recorded delivery performance (real shipment rows)
  const delivered = await db.shipment.findMany({
    where: { warehouseId, direction: "OUTBOUND", status: "DELIVERED", deliveredAt: { gte: from } },
    select: { deliveredAt: true, eta: true },
  });
  const deliveryWeeks = new Map<string, { week: string; onTime: number; late: number }>();
  for (const s of delivered) {
    const key = weekStart(s.deliveredAt!);
    const row = deliveryWeeks.get(key) ?? { week: key, onTime: 0, late: 0 };
    if (s.deliveredAt! <= new Date(s.eta.getTime() + 15 * 60_000)) row.onTime++;
    else row.late++;
    deliveryWeeks.set(key, row);
  }

  const sum = <K extends keyof (typeof daily)[number]>(k: K) => daily.reduce((s, d) => s + (d[k] as number), 0);
  const avg = <K extends keyof (typeof daily)[number]>(k: K) => (daily.length ? sum(k) / daily.length : 0);
  const half = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, half);
  const secondHalf = daily.slice(half);
  const trend = (k: keyof (typeof daily)[number]) => {
    const a = firstHalf.reduce((s, d) => s + (d[k] as number), 0) / Math.max(1, firstHalf.length);
    const b = secondHalf.reduce((s, d) => s + (d[k] as number), 0) / Math.max(1, secondHalf.length);
    return a ? ((b - a) / a) * 100 : 0;
  };

  return {
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days: f.days },
    summary: {
      ordersShipped: sum("ordersShipped"),
      ordersTrend: trend("ordersShipped"),
      unitsPicked: sum("unitsPicked"),
      avgUtilization: avg("utilization"),
      avgOnTime: avg("onTimeRate"),
      operatingCost: sum("operatingCost"),
      costTrend: trend("costPerOrder"),
      avgTurnover: avg("inventoryTurnover"),
      unitsPerLaborHour: sum("laborHours") ? sum("unitsPicked") / sum("laborHours") : 0,
      deliveredShipments: delivered.length,
    },
    daily,
    movements: [...weeks.values()],
    byCategory,
    delivery: [...deliveryWeeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof getAnalytics>>;
