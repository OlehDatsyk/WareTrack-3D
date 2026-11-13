/**
 * Shared layout geometry. Used by the seed (to compute stored coordinates), by the
 * simulation (to plan routes) and by the 3D scene (to animate vehicles).
 * Units are metres; y is up; the main building is centred on the origin.
 */

export type Vec2 = { x: number; z: number };

export type SiteLayout = {
  /** z of the main east-west aisle inside the building */
  mainAisleZ: number;
  /** x positions of north-south connector aisles */
  connectorsX: number[];
  /** Forklift charging/parking spots */
  chargeSpots: (Vec2 & { heading: number })[];
  /** Truck parking spots for fleet trucks that are on site but not docked */
  truckParking: (Vec2 & { heading: number })[];
  /** Decorative/structural elements of the site */
  office: { x: number; z: number; width: number; depth: number; floors: number };
  carPark: { x: number; z: number; width: number; depth: number };
  road: { x: number; width: number; zMin: number; zMax: number };
  apron: { xMin: number; xMax: number; zMin: number; zMax: number };
  containers: (Vec2 & { rotation: number; color: string; label: string; stacked?: boolean })[];
  trees: Vec2[];
  walkways: { from: Vec2; to: Vec2 }[];
  wallHeight: number;
};

export type RackGeometry = {
  posX: number;
  posZ: number;
  rotation: number;
  length: number;
  depth: number;
  levels: number;
  columns: number;
  levelHeight: number;
  aisleSide: number;
};

export const PALLET_BASE_HEIGHT = 0.15;
export const RACK_FIRST_BEAM = 0.12;

/** World position of a storage slot (where the pallet base sits). */
export function rackSlotPosition(rack: RackGeometry, column: number, level: number) {
  const colWidth = rack.length / rack.columns;
  const localX = -rack.length / 2 + colWidth * (column + 0.5);
  const y = level === 0 ? RACK_FIRST_BEAM : level * rack.levelHeight + RACK_FIRST_BEAM;
  const cos = Math.cos(rack.rotation);
  const sin = Math.sin(rack.rotation);
  return {
    x: rack.posX + localX * cos,
    y,
    z: rack.posZ - localX * sin,
  };
}

/** Point in the aisle in front of a slot where a forklift stops to pick or place. */
export function rackAccessPoint(rack: RackGeometry, column: number): Vec2 {
  const slot = rackSlotPosition(rack, column, 0);
  const offset = rack.depth / 2 + 1.5;
  const cos = Math.cos(rack.rotation);
  const sin = Math.sin(rack.rotation);
  // local +z rotated by rotation
  const dx = sin * offset * rack.aisleSide;
  const dz = cos * offset * rack.aisleSide;
  return { x: slot.x + dx, z: slot.z + dz };
}

export type Waypoint = Vec2;

function nearest(values: number[], target: number) {
  let best = values[0] ?? 0;
  for (const v of values) if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  return best;
}

function pushUnique(path: Waypoint[], p: Waypoint) {
  const last = path[path.length - 1];
  if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.z - p.z) > 0.01) path.push(p);
}

/**
 * Manhattan-style route through the aisle network:
 * start → along its aisle to a connector → main aisle → target connector → target aisle → target.
 */
export function planRoute(layout: Pick<SiteLayout, "mainAisleZ" | "connectorsX">, from: Vec2, to: Vec2): Waypoint[] {
  const path: Waypoint[] = [];
  pushUnique(path, from);
  const cFrom = nearest(layout.connectorsX, from.x);
  const cTo = nearest(layout.connectorsX, to.x);
  const sameAisle = Math.abs(from.z - to.z) < 0.5;
  if (sameAisle) {
    pushUnique(path, to);
    return path;
  }
  pushUnique(path, { x: cFrom, z: from.z });
  pushUnique(path, { x: cFrom, z: layout.mainAisleZ });
  pushUnique(path, { x: cTo, z: layout.mainAisleZ });
  pushUnique(path, { x: cTo, z: to.z });
  pushUnique(path, to);
  return path;
}

export function pathLength(path: Waypoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  }
  return len;
}

/** Position and heading at fraction t (0..1) along a path. */
export function samplePath(path: Waypoint[], t: number): { x: number; z: number; heading: number } {
  if (path.length === 0) return { x: 0, z: 0, heading: 0 };
  if (path.length === 1) return { x: path[0]!.x, z: path[0]!.z, heading: 0 };
  const total = pathLength(path);
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= seg || i === path.length - 1) {
      const f = seg === 0 ? 1 : Math.min(remaining / seg, 1);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    remaining -= seg;
  }
  const last = path[path.length - 1]!;
  return { x: last.x, z: last.z, heading: 0 };
}
