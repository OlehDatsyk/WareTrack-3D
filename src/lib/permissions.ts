import type { Role } from "@/generated/prisma/enums";

/**
 * Permission catalogue. The server enforces these on every API route
 * (see src/server/api/handler.ts); the client only uses them to hide controls.
 */
export const PERMISSIONS = [
  "dashboard:read",
  "inventory:read",
  "inventory:write", // create / edit products
  "inventory:delete",
  "inventory:adjust", // adjust quantities, transfer, record damage, move pallets
  "orders:read",
  "orders:write", // create / edit / assign orders
  "orders:status",
  "shipments:read",
  "shipments:write",
  "fleet:read",
  "fleet:write",
  "fleet:assign",
  "workforce:read",
  "workforce:write",
  "zones:read",
  "zones:write",
  "tasks:write",
  "analytics:read",
  "notifications:read",
  "simulation:control",
  "settings:warehouse",
  "users:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  "dashboard:read",
  "inventory:read",
  "orders:read",
  "shipments:read",
  "fleet:read",
  "workforce:read",
  "zones:read",
  "analytics:read",
  "notifications:read",
];

const OPERATOR: Permission[] = [
  ...READ_ONLY,
  "inventory:adjust",
  "orders:status",
  "shipments:write",
  "fleet:assign",
  "tasks:write",
];

const MANAGER: Permission[] = [
  ...OPERATOR,
  "inventory:write",
  "inventory:delete",
  "orders:write",
  "fleet:write",
  "workforce:write",
  "zones:write",
  "simulation:control",
  "settings:warehouse",
  "audit:read",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  MANAGER: new Set(MANAGER),
  OPERATOR: new Set(OPERATOR),
  VIEWER: new Set(READ_ONLY),
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Full access including user management and system configuration.",
  MANAGER: "Runs the warehouse: catalogue, zones, fleet, workforce and simulation.",
  OPERATOR: "Executes day-to-day work: stock moves, tasks, order and shipment updates.",
  VIEWER: "Read-only access to dashboards, inventory and reports.",
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
