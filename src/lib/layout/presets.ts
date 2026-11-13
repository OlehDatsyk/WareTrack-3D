import type { SiteLayout } from "./geometry";

/**
 * Facility definitions used by the seed script. After seeding, the database is the
 * source of truth: the 3D scene renders whatever zones/racks/docks are stored.
 */

export type ZoneDef = {
  code: string;
  name: string;
  type: "RECEIVING" | "STORAGE" | "PICKING" | "PACKING" | "DISPATCH" | "RETURNS" | "DAMAGED" | "YARD";
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  temperatureC?: number;
  indoor?: boolean;
  notes?: string;
};

export type RackDef = {
  code: string;
  zone: string;
  kind: "PALLET_RACK" | "SHELVING";
  posX: number;
  posZ: number;
  length: number;
  depth: number;
  levels: number;
  columns: number;
  levelHeight: number;
  aisleSide: 1 | -1;
};

export type FloorGridDef = {
  zone: string;
  prefix: string;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  spacingX: number;
  spacingZ: number;
};

export type DockDef = {
  code: string;
  name: string;
  direction: "INBOUND" | "OUTBOUND";
  posX: number;
  posZ: number;
  rotation: number;
};

export type WarehousePreset = {
  code: string;
  name: string;
  address: string;
  city: string;
  timezone: string;
  buildingWidth: number;
  buildingDepth: number;
  zones: ZoneDef[];
  racks: RackDef[];
  floorGrids: FloorGridDef[];
  docks: DockDef[];
  site: SiteLayout;
};

export const ZONE_COLORS: Record<ZoneDef["type"], string> = {
  RECEIVING: "#0EA5E9",
  STORAGE: "#2563EB",
  PICKING: "#6366F1",
  PACKING: "#8B5CF6",
  DISPATCH: "#F59E0B",
  RETURNS: "#F97316",
  DAMAGED: "#DC2626",
  YARD: "#64748B",
};

function palletRackRows(
  zone: string,
  prefix: string,
  centerX: number,
  rows: { z: number; aisleSide: 1 | -1 }[],
  opts: { columns: number; colWidth: number; levels: number; levelHeight: number; depth: number; kind?: RackDef["kind"] },
): RackDef[] {
  return rows.map((row, i) => ({
    code: `${prefix}${String(i + 1).padStart(2, "0")}`,
    zone,
    kind: opts.kind ?? "PALLET_RACK",
    posX: centerX,
    posZ: row.z,
    length: opts.columns * opts.colWidth,
    depth: opts.depth,
    levels: opts.levels,
    columns: opts.columns,
    levelHeight: opts.levelHeight,
    aisleSide: row.aisleSide,
  }));
}

function trees(seedPoints: [number, number][]) {
  return seedPoints.map(([x, z]) => ({ x, z }));
}

// ───────────────────────────── WH-01 Riverside Hub ─────────────────────────────

const PALLET_RACK = { columns: 12, colWidth: 1.35, levels: 4, levelHeight: 1.6, depth: 1.1 };
const SHELVING = { columns: 16, colWidth: 1.0, levels: 3, levelHeight: 0.9, depth: 0.8, kind: "SHELVING" as const };

export const RIVERSIDE_HUB: WarehousePreset = {
  code: "WH-01",
  name: "Riverside Hub",
  address: "4200 Riverside Logistics Pkwy",
  city: "Camden, NJ",
  timezone: "America/New_York",
  buildingWidth: 80,
  buildingDepth: 44,
  zones: [
    { code: "RCV", name: "Receiving", type: "RECEIVING", x: 27, z: -11.5, width: 22, depth: 17, color: ZONE_COLORS.RECEIVING },
    { code: "DSP", name: "Dispatch", type: "DISPATCH", x: 27, z: 11.5, width: 22, depth: 17, color: ZONE_COLORS.DISPATCH },
    { code: "STA", name: "Storage A", type: "STORAGE", x: -25, z: -11.5, width: 26, depth: 17, color: ZONE_COLORS.STORAGE, temperatureC: 18 },
    {
      code: "STB",
      name: "Storage B (Chilled)",
      type: "STORAGE",
      x: -25,
      z: 11.5,
      width: 26,
      depth: 17,
      color: "#0891B2",
      temperatureC: 4,
      notes: "Temperature-controlled storage for food and beverage lines.",
    },
    { code: "PCK", name: "Picking", type: "PICKING", x: 2, z: -15, width: 20, depth: 10, color: ZONE_COLORS.PICKING, temperatureC: 19 },
    { code: "RTN", name: "Returns", type: "RETURNS", x: -3.5, z: -5.5, width: 9, depth: 5, color: ZONE_COLORS.RETURNS },
    { code: "DMG", name: "Damaged Goods", type: "DAMAGED", x: 7.5, z: -5.5, width: 9, depth: 5, color: ZONE_COLORS.DAMAGED },
    { code: "PAK", name: "Packing", type: "PACKING", x: 2, z: 13, width: 20, depth: 14, color: ZONE_COLORS.PACKING },
    { code: "YRD", name: "Yard Storage", type: "YARD", x: 22, z: -36, width: 34, depth: 12, color: ZONE_COLORS.YARD, indoor: false },
  ],
  racks: [
    ...palletRackRows(
      "STA",
      "A",
      -25,
      [
        { z: -19.0, aisleSide: 1 },
        { z: -14.95, aisleSide: -1 },
        { z: -13.85, aisleSide: 1 },
        { z: -9.85, aisleSide: -1 },
        { z: -8.75, aisleSide: 1 },
        { z: -4.75, aisleSide: -1 },
      ],
      PALLET_RACK,
    ),
    ...palletRackRows(
      "STB",
      "B",
      -25,
      [
        { z: 4.75, aisleSide: 1 },
        { z: 8.75, aisleSide: -1 },
        { z: 9.85, aisleSide: 1 },
        { z: 13.85, aisleSide: -1 },
        { z: 14.95, aisleSide: 1 },
        { z: 19.0, aisleSide: -1 },
      ],
      PALLET_RACK,
    ),
    ...palletRackRows(
      "PCK",
      "P",
      2,
      [
        { z: -19.2, aisleSide: 1 },
        { z: -16.0, aisleSide: -1 },
        { z: -15.2, aisleSide: 1 },
        { z: -12.0, aisleSide: -1 },
      ],
      SHELVING,
    ),
  ],
  floorGrids: [
    { zone: "RCV", prefix: "RCV", originX: 21, originZ: -17.5, cols: 5, rows: 4, spacingX: 2.6, spacingZ: 3.2 },
    { zone: "DSP", prefix: "DSP", originX: 21, originZ: 7.5, cols: 5, rows: 4, spacingX: 2.6, spacingZ: 3.2 },
    { zone: "RTN", prefix: "RTN", originX: -6.6, originZ: -6.6, cols: 4, rows: 2, spacingX: 2.0, spacingZ: 2.2 },
    { zone: "DMG", prefix: "DMG", originX: 4.4, originZ: -6.6, cols: 4, rows: 2, spacingX: 2.0, spacingZ: 2.2 },
    { zone: "PAK", prefix: "PAK", originX: -6, originZ: 16.5, cols: 7, rows: 2, spacingX: 2.0, spacingZ: 2.2 },
    { zone: "YRD", prefix: "YRD", originX: 8, originZ: -39, cols: 6, rows: 2, spacingX: 2.4, spacingZ: 2.6 },
  ],
  docks: [
    { code: "D1", name: "Bay 1", direction: "INBOUND", posX: 40, posZ: -17, rotation: 0 },
    { code: "D2", name: "Bay 2", direction: "INBOUND", posX: 40, posZ: -11.5, rotation: 0 },
    { code: "D3", name: "Bay 3", direction: "INBOUND", posX: 40, posZ: -6, rotation: 0 },
    { code: "D4", name: "Bay 4", direction: "OUTBOUND", posX: 40, posZ: 6, rotation: 0 },
    { code: "D5", name: "Bay 5", direction: "OUTBOUND", posX: 40, posZ: 11.5, rotation: 0 },
    { code: "D6", name: "Bay 6", direction: "OUTBOUND", posX: 40, posZ: 17, rotation: 0 },
  ],
  site: {
    mainAisleZ: 0,
    connectorsX: [-36, -10, 14, 37.5],
    wallHeight: 9,
    chargeSpots: [-6.5, -4.5, -2.5, -0.5, 1.5, 3.5, 5.5, 7.5].map((x) => ({ x, z: 4.6, heading: Math.PI })),
    truckParking: [
      { x: 64, z: 30, heading: Math.PI / 2 },
      { x: 64, z: 34.5, heading: Math.PI / 2 },
      { x: 64, z: 39, heading: Math.PI / 2 },
      { x: 64, z: 43.5, heading: Math.PI / 2 },
      { x: 64, z: 48, heading: Math.PI / 2 },
      { x: 64, z: 52.5, heading: Math.PI / 2 },
    ],
    office: { x: -24, z: 35, width: 18, depth: 10, floors: 2 },
    carPark: { x: -2, z: 36, width: 20, depth: 12 },
    road: { x: 80, width: 9, zMin: -70, zMax: 70 },
    apron: { xMin: 40, xMax: 76, zMin: -46, zMax: 58 },
    containers: [
      { x: 30, z: -38.5, rotation: 0, color: "#1D4ED8", label: "BLUEPEAK" },
      { x: 30, z: -35.6, rotation: 0, color: "#0F766E", label: "NORTHLINE" },
      { x: 30, z: -38.5, rotation: 0, color: "#B45309", label: "MERIDIAN", stacked: true },
      { x: 36, z: -37, rotation: Math.PI / 2, color: "#2563EB", label: "WARETRACK" },
      { x: -48, z: -12, rotation: Math.PI / 2, color: "#0E7490", label: "HARBORLINE" },
    ],
    trees: trees([
      [-58, -40], [-50, -46], [-60, -24], [-62, -6], [-60, 12], [-58, 30], [-50, 46], [-38, 50],
      [-44, -50], [-30, -52], [-14, -50], [0, -52], [-6, 46], [10, 48], [20, 46], [-62, 48],
      [92, -40], [94, -18], [92, 4], [94, 26], [92, 48], [-10, 28], [12, 28], [-40, 28],
      [50, -56], [64, -58], [36, 62], [50, 64],
    ]),
    walkways: [
      { from: { x: -15, z: 35 }, to: { x: -15, z: 22 } },
      { from: { x: -15, z: 22 }, to: { x: 40, z: 22 } },
    ],
  },
};

// ───────────────────────────── WH-02 Northgate DC ─────────────────────────────

export const NORTHGATE_DC: WarehousePreset = {
  code: "WH-02",
  name: "Northgate DC",
  address: "88 Northgate Industrial Dr",
  city: "Columbus, OH",
  timezone: "America/New_York",
  buildingWidth: 60,
  buildingDepth: 36,
  zones: [
    { code: "RCV", name: "Receiving", type: "RECEIVING", x: 20, z: -9, width: 16, depth: 14, color: ZONE_COLORS.RECEIVING },
    { code: "DSP", name: "Dispatch", type: "DISPATCH", x: 20, z: 9, width: 16, depth: 14, color: ZONE_COLORS.DISPATCH },
    { code: "STA", name: "Storage A", type: "STORAGE", x: -16, z: -9, width: 24, depth: 14, color: ZONE_COLORS.STORAGE, temperatureC: 17 },
    { code: "STB", name: "Storage B", type: "STORAGE", x: -16, z: 9, width: 24, depth: 14, color: ZONE_COLORS.STORAGE, temperatureC: 17 },
    { code: "PCK", name: "Picking", type: "PICKING", x: 4, z: -10, width: 12, depth: 12, color: ZONE_COLORS.PICKING },
    { code: "PAK", name: "Packing", type: "PACKING", x: 4, z: 10, width: 12, depth: 12, color: ZONE_COLORS.PACKING },
    { code: "RTN", name: "Returns", type: "RETURNS", x: -16, z: -24, width: 12, depth: 6, color: ZONE_COLORS.RETURNS, indoor: false },
    { code: "DMG", name: "Damaged Goods", type: "DAMAGED", x: -2, z: -24, width: 10, depth: 6, color: ZONE_COLORS.DAMAGED, indoor: false },
  ],
  racks: [
    ...palletRackRows(
      "STA",
      "A",
      -16,
      [
        { z: -15.0, aisleSide: 1 },
        { z: -11.0, aisleSide: -1 },
        { z: -9.9, aisleSide: 1 },
        { z: -5.0, aisleSide: -1 },
      ],
      { ...PALLET_RACK, columns: 11 },
    ),
    ...palletRackRows(
      "STB",
      "B",
      -16,
      [
        { z: 5.0, aisleSide: 1 },
        { z: 9.9, aisleSide: -1 },
        { z: 11.0, aisleSide: 1 },
        { z: 15.0, aisleSide: -1 },
      ],
      { ...PALLET_RACK, columns: 11 },
    ),
    ...palletRackRows(
      "PCK",
      "P",
      4,
      [
        { z: -14.6, aisleSide: 1 },
        { z: -11.4, aisleSide: -1 },
        { z: -10.6, aisleSide: 1 },
        { z: -6.4, aisleSide: -1 },
      ],
      { ...SHELVING, columns: 9 },
    ),
  ],
  floorGrids: [
    { zone: "RCV", prefix: "RCV", originX: 15, originZ: -14, cols: 4, rows: 3, spacingX: 2.6, spacingZ: 3.4 },
    { zone: "DSP", prefix: "DSP", originX: 15, originZ: 5, cols: 4, rows: 3, spacingX: 2.6, spacingZ: 3.4 },
    { zone: "PAK", prefix: "PAK", originX: -0.5, originZ: 12, cols: 5, rows: 2, spacingX: 2.2, spacingZ: 2.4 },
    { zone: "RTN", prefix: "RTN", originX: -20.5, originZ: -25, cols: 4, rows: 2, spacingX: 2.6, spacingZ: 2.4 },
    { zone: "DMG", prefix: "DMG", originX: -5.5, originZ: -25, cols: 3, rows: 2, spacingX: 2.6, spacingZ: 2.4 },
  ],
  docks: [
    { code: "D1", name: "Bay 1", direction: "INBOUND", posX: 30, posZ: -12, rotation: 0 },
    { code: "D2", name: "Bay 2", direction: "INBOUND", posX: 30, posZ: -6, rotation: 0 },
    { code: "D3", name: "Bay 3", direction: "OUTBOUND", posX: 30, posZ: 6, rotation: 0 },
    { code: "D4", name: "Bay 4", direction: "OUTBOUND", posX: 30, posZ: 12, rotation: 0 },
  ],
  site: {
    mainAisleZ: 0,
    connectorsX: [-29, -2, 11, 28],
    wallHeight: 8.5,
    chargeSpots: [-1, 1, 3, 5, 7].map((x) => ({ x, z: 3.4, heading: Math.PI })),
    truckParking: [
      { x: 52, z: 22, heading: Math.PI / 2 },
      { x: 52, z: 26.5, heading: Math.PI / 2 },
      { x: 52, z: 31, heading: Math.PI / 2 },
      { x: 52, z: 35.5, heading: Math.PI / 2 },
    ],
    office: { x: -18, z: 28, width: 14, depth: 9, floors: 2 },
    carPark: { x: 2, z: 29, width: 16, depth: 10 },
    road: { x: 66, width: 9, zMin: -60, zMax: 60 },
    apron: { xMin: 30, xMax: 62, zMin: -30, zMax: 42 },
    containers: [
      { x: 14, z: -26, rotation: 0, color: "#0F766E", label: "NORTHLINE" },
      { x: 14, z: -23, rotation: 0, color: "#1D4ED8", label: "BLUEPEAK" },
    ],
    trees: trees([
      [-44, -30], [-46, -10], [-44, 10], [-42, 30], [-30, 40], [-10, 42], [16, 40], [-36, -40],
      [-16, -40], [4, -40], [24, -40], [76, -30], [78, 0], [76, 30], [40, 52],
    ]),
    walkways: [
      { from: { x: -11, z: 28 }, to: { x: -11, z: 18 } },
      { from: { x: -11, z: 18 }, to: { x: 30, z: 18 } },
    ],
  },
};

export const WAREHOUSE_PRESETS = [RIVERSIDE_HUB, NORTHGATE_DC];
