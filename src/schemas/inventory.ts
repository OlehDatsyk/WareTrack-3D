import { z } from "zod";
import { optionalEnum, optionalString, paginationSchema } from "./common";

export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, "SKU must be at least 3 characters")
    .max(32)
    .regex(/^[A-Z0-9-]+$/, "Use upper-case letters, digits and dashes"),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, "Barcode must be 8–14 digits")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  name: z.string().trim().min(2, "Name is required").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().min(2, "Category is required").max(60),
  unit: z.string().trim().min(1).max(12).default("ea"),
  unitWeightKg: z.coerce.number().min(0, "Must be positive").max(5000),
  unitCost: z.coerce.number().min(0, "Must be positive").max(1_000_000),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
  reorderQty: z.coerce.number().int().min(0).max(1_000_000),
  supplierId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productQuerySchema = paginationSchema.extend({
  q: optionalString,
  category: optionalString,
  stock: optionalEnum(["low", "out", "ok"] as const),
  includeArchived: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  sort: z.enum(["sku", "name", "category", "onHand", "available", "reserved", "damaged", "value"]).default("sku"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export const adjustSchema = z.object({
  zoneId: z.string().min(1, "Choose a zone"),
  delta: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "Enter a non-zero adjustment")
    .refine((v) => Math.abs(v) <= 100_000, "Adjustment is too large"),
  reason: z.string().trim().min(3, "Give a reason").max(200),
});

export const transferSchema = z
  .object({
    fromZoneId: z.string().min(1, "Choose the source zone"),
    toZoneId: z.string().min(1, "Choose the destination zone"),
    quantity: z.coerce.number().int().min(1, "At least one unit").max(1_000_000),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.fromZoneId !== v.toZoneId, { path: ["toZoneId"], message: "Source and destination must differ" });

export const zoneDamageSchema = z.object({
  zoneId: z.string().min(1, "Choose a zone"),
  quantity: z.coerce.number().int().min(1, "At least one unit").max(1_000_000),
  note: z.string().trim().min(3, "Describe the damage").max(300),
});
