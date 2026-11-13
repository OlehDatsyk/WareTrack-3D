import { z } from "zod";
import { optionalString, paginationSchema } from "./common";
import { passwordRule } from "./auth";

export const notificationCategories = ["INVENTORY", "ORDER", "SHIPMENT", "FLEET", "CAPACITY", "WORKFORCE", "SYSTEM"] as const;

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80).optional(),
  title: z.string().trim().max(80).optional().nullable(),
  defaultWarehouseId: z.string().optional().nullable(),
  preferences: z
    .object({
      notifications: z.object({ muted: z.array(z.enum(notificationCategories)).max(7) }).optional(),
      density: z.enum(["comfortable", "compact"]).optional(),
      showSceneLabels: z.boolean().optional(),
    })
    .optional(),
});

export const warehouseSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(160),
  city: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(3).max(60),
  capacityWarningPct: z.coerce.number().int().min(50, "Min 50%").max(100, "Max 100%"),
  dockSlotMinutes: z.coerce.number().int().min(10).max(240),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  simulationRunning: z.boolean(),
  simulationIntervalSec: z.coerce.number().int().min(2, "Min 2 s").max(60, "Max 60 s"),
});

export const roles = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email("Enter a valid email").max(200),
  role: z.enum(roles),
  title: z.string().trim().max(80).optional().nullable(),
  password: passwordRule,
});

export const updateUserSchema = z.object({
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
  title: z.string().trim().max(80).optional().nullable(),
});

export const auditQuerySchema = paginationSchema.extend({
  q: optionalString,
  entityType: optionalString,
});

export const activityQuerySchema = paginationSchema.extend({
  source: z.enum(["all", "simulated", "manual"]).default("all"),
  type: optionalString,
});
