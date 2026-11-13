import { z } from "zod";
import { optionalEnum, optionalString, paginationSchema } from "./common";

export const shipmentStatuses = ["PLANNED", "AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED"] as const;

export const shipmentSchema = z
  .object({
    direction: z.enum(["INBOUND", "OUTBOUND"]),
    carrier: z.string().trim().min(2, "Carrier is required").max(60),
    counterpart: z.string().trim().min(2, "Destination / origin is required").max(80),
    scheduledAt: z.coerce.date({ error: "Choose a date" }),
    eta: z.coerce.date({ error: "Choose an ETA" }),
    palletCount: z.coerce.number().int().min(0).max(60).default(0),
    weightKg: z.coerce.number().min(0).max(40_000).default(0),
    vehicleId: z.string().optional().nullable(),
    driverId: z.string().optional().nullable(),
    orderIds: z.array(z.string()).max(50).default([]),
  })
  .refine((v) => v.eta >= v.scheduledAt, { path: ["eta"], message: "ETA must be after the scheduled time" });

export const shipmentStatusSchema = z.object({
  status: z.enum(shipmentStatuses),
  note: z.string().trim().max(200).optional(),
  delayMinutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
});

export const shipmentAssignSchema = z.object({
  vehicleId: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
});

export const shipmentQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: optionalEnum(shipmentStatuses),
  direction: optionalEnum(["INBOUND", "OUTBOUND"] as const),
  active: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});
export type ShipmentQuery = z.infer<typeof shipmentQuerySchema>;
