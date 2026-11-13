import { z } from "zod";

export const movePalletSchema = z.object({
  toLocationId: z.string().min(1, "Choose a destination"),
  mode: z.enum(["task", "now"]).default("task"),
  vehicleId: z.string().min(1).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export const damageSchema = z.object({
  quantity: z.coerce.number().int().min(1, "At least one unit").max(100_000),
  note: z.string().trim().min(3, "Describe the damage").max(300),
  moveToDamagedZone: z.boolean().default(true),
});

export const createTaskSchema = z.object({
  type: z.enum(["PUTAWAY", "PICK", "REPLENISH", "TRANSFER", "LOAD", "UNLOAD", "CYCLE_COUNT"]),
  description: z.string().trim().min(3).max(240),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  palletId: z.string().optional().nullable(),
  toLocationId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  shipmentId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
});

export const startTaskSchema = z.object({
  vehicleId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

export const assignTaskToVehicleSchema = z.object({ taskId: z.string().min(1, "Choose a task") });

export const assignDockSchema = z.object({
  dockId: z.string().min(1, "Choose a dock"),
  vehicleId: z.string().optional().nullable(),
});

export const zoneStatusSchema = z.enum(["ACTIVE", "RESTRICTED", "MAINTENANCE", "CLOSED"]);

export const zoneSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9-]+$/, "Use upper-case letters, digits and dashes"),
  name: z.string().trim().min(2).max(60),
  type: z.enum(["RECEIVING", "STORAGE", "PICKING", "PACKING", "DISPATCH", "RETURNS", "DAMAGED", "YARD"]),
  status: zoneStatusSchema.default("ACTIVE"),
  temperatureC: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(-40).max(50).nullable()).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour").default("#2563EB"),
  notes: z.string().trim().max(500).optional().nullable(),
  x: z.coerce.number().min(-300).max(300),
  z: z.coerce.number().min(-300).max(300),
  width: z.coerce.number().min(2).max(200),
  depth: z.coerce.number().min(2).max(200),
  indoor: z.boolean().default(true),
  floorSlots: z.coerce.number().int().min(0).max(60).default(0),
});

export const zoneUpdateSchema = zoneSchema
  .omit({ floorSlots: true })
  .partial()
  .extend({ statusReason: z.string().trim().max(200).optional() });
