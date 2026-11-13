import { z } from "zod";

export const vehicleTypes = ["FORKLIFT", "REACH_TRUCK", "PALLET_JACK", "TRUCK", "VAN"] as const;
export const vehicleStatuses = ["AVAILABLE", "IN_USE", "CHARGING", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

export const vehicleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(16)
    .regex(/^[A-Z0-9-]+$/, "Use upper-case letters, digits and dashes"),
  type: z.enum(vehicleTypes),
  model: z.string().trim().min(2).max(60),
  registration: z.string().trim().max(20).optional().nullable(),
  carrier: z.string().trim().max(60).optional().nullable(),
  energyType: z.enum(["ELECTRIC", "DIESEL"]),
  energyLevel: z.coerce.number().int().min(0).max(100).default(100),
  operatorId: z.string().optional().nullable(),
  nextServiceDue: z.coerce.date().optional().nullable(),
});

export const vehicleUpdateSchema = vehicleSchema.partial().extend({
  status: z.enum(vehicleStatuses).optional(),
});

export const maintenanceSchema = z.object({
  type: z.string().trim().min(2).max(60),
  description: z.string().trim().min(3).max(300),
  cost: z.coerce.number().min(0).max(1_000_000).default(0),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]).default("COMPLETED"),
  performedBy: z.string().trim().max(80).optional().nullable(),
  performedAt: z.coerce.date().optional(),
});
