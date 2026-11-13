import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "@/lib/rng";
import { pathLength, planRoute, rackAccessPoint, rackSlotPosition, samplePath } from "@/lib/layout/geometry";
import { RIVERSIDE_HUB, WAREHOUSE_PRESETS } from "@/lib/layout/presets";
import { canTransitionOrder, canTransitionShipment, ORDER_TRANSITIONS } from "@/lib/workflows";
import { can, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { fmtPercent, humanize, initials, pctChange } from "@/lib/format";
import { toCsv } from "@/lib/hooks";
import { countsAsInventory, palletStatusForZone } from "@/server/services/stock";

describe("deterministic RNG", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(hashSeed(42, 7, "tasks"));
    const b = createRng(hashSeed(42, 7, "tasks"));
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });
  it("differs for different ticks", () => {
    expect(createRng(hashSeed(42, 7)).next()).not.toEqual(createRng(hashSeed(42, 8)).next());
  });
  it("keeps int() within bounds", () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe("layout geometry", () => {
  const rack = { posX: 0, posZ: 0, rotation: 0, length: 12, depth: 1.2, levels: 4, columns: 6, levelHeight: 1.5, aisleSide: 1 };
  it("centres slots inside the rack and stacks levels", () => {
    const first = rackSlotPosition(rack, 0, 0);
    const last = rackSlotPosition(rack, 5, 3);
    expect(first.x).toBeCloseTo(-5);
    expect(last.x).toBeCloseTo(5);
    expect(last.y).toBeGreaterThan(first.y);
  });
  it("places the access point in the aisle on the configured side", () => {
    expect(rackAccessPoint(rack, 0).z).toBeGreaterThan(0);
    expect(rackAccessPoint({ ...rack, aisleSide: -1 }, 0).z).toBeLessThan(0);
  });
  it("routes through the main aisle between different aisles", () => {
    const layout = { mainAisleZ: 0, connectorsX: [-10, 10] };
    const route = planRoute(layout, { x: -20, z: -8 }, { x: 15, z: 9 });
    expect(route[0]).toEqual({ x: -20, z: -8 });
    expect(route.at(-1)).toEqual({ x: 15, z: 9 });
    expect(route.some((p) => p.z === 0)).toBe(true);
    // every leg is axis-aligned (Manhattan routing)
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!;
      const b = route[i]!;
      expect(a.x === b.x || a.z === b.z).toBe(true);
    }
  });
  it("samples positions along a path", () => {
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    expect(pathLength(path)).toBe(20);
    expect(samplePath(path, 0.25)).toMatchObject({ x: 5, z: 0 });
    expect(samplePath(path, 0.75)).toMatchObject({ x: 10, z: 5 });
    expect(samplePath(path, 2)).toMatchObject({ x: 10, z: 10 });
  });
  it("keeps every preset rack inside its zone", () => {
    for (const preset of WAREHOUSE_PRESETS) {
      for (const r of preset.racks) {
        const zone = preset.zones.find((z) => z.code === r.zone)!;
        expect(r.posX - r.length / 2).toBeGreaterThanOrEqual(zone.x - zone.width / 2);
        expect(r.posX + r.length / 2).toBeLessThanOrEqual(zone.x + zone.width / 2);
        expect(Math.abs(r.posZ - zone.z)).toBeLessThanOrEqual(zone.depth / 2);
      }
    }
  });
  it("puts docks on the building's east wall", () => {
    for (const d of RIVERSIDE_HUB.docks) expect(d.posX).toBe(RIVERSIDE_HUB.buildingWidth / 2);
  });
});

describe("workflows", () => {
  it("allows the forward order flow and cancellation before dispatch", () => {
    expect(canTransitionOrder("PENDING", "PROCESSING")).toBe(true);
    expect(canTransitionOrder("PICKING", "PACKING")).toBe(true);
    expect(canTransitionOrder("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("DISPATCHED", "CANCELLED")).toBe(false);
  });
  it("rejects skipping steps and reopening closed orders", () => {
    expect(canTransitionOrder("PENDING", "DISPATCHED")).toBe(false);
    expect(ORDER_TRANSITIONS.DELIVERED).toHaveLength(0);
    expect(ORDER_TRANSITIONS.CANCELLED).toHaveLength(0);
  });
  it("models shipment departure and delay", () => {
    expect(canTransitionShipment("READY", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("IN_TRANSIT", "DELAYED")).toBe(true);
    expect(canTransitionShipment("DELIVERED", "IN_TRANSIT")).toBe(false);
  });
});

describe("permissions", () => {
  it("gives administrators every permission", () => {
    expect(ROLE_PERMISSIONS.ADMIN.size).toBe(PERMISSIONS.length);
  });
  it("keeps viewers read-only", () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) expect(p.endsWith(":read")).toBe(true);
    expect(can("VIEWER", "inventory:adjust")).toBe(false);
  });
  it("lets operators adjust stock but not manage users or delete products", () => {
    expect(can("OPERATOR", "inventory:adjust")).toBe(true);
    expect(can("OPERATOR", "inventory:delete")).toBe(false);
    expect(can("OPERATOR", "users:manage")).toBe(false);
  });
  it("restricts user management to administrators", () => {
    expect(can("MANAGER", "users:manage")).toBe(false);
    expect(can("ADMIN", "users:manage")).toBe(true);
    expect(can(undefined, "dashboard:read")).toBe(false);
  });
});

describe("stock rules", () => {
  it("excludes staged outbound zones from on-hand inventory", () => {
    expect(countsAsInventory("DISPATCH")).toBe(false);
    expect(countsAsInventory("PACKING")).toBe(false);
    expect(countsAsInventory("STORAGE")).toBe(true);
  });
  it("derives pallet status from the zone it lands in", () => {
    expect(palletStatusForZone("STORAGE")).toBe("STORED");
    expect(palletStatusForZone("DISPATCH")).toBe("STAGED");
    expect(palletStatusForZone("DAMAGED")).toBe("DAMAGED");
    expect(palletStatusForZone("RECEIVING")).toBe("RECEIVED");
  });
});

describe("formatting helpers", () => {
  it("formats values", () => {
    expect(humanize("READY_FOR_DISPATCH")).toBe("Ready for dispatch");
    expect(initials("Alex Chen")).toBe("AC");
    expect(fmtPercent(96.456)).toBe("96.5%");
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(5, 0)).toBe(0);
  });
  it("escapes CSV and neutralises formula injection", () => {
    const csv = toCsv([{ a: "=SUM(A1)", b: 'say "hi", ok' }]);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"say ""hi"", ok"');
  });
});
