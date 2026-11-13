import { z } from "zod";
import { optionalEnum, optionalString, paginationSchema } from "./common";

export const orderStatuses = ["PENDING", "PROCESSING", "PICKING", "PACKING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;
export const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const orderItemSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  quantity: z.coerce.number().int().min(1, "Min 1").max(100_000),
});

export const orderSchema = z
  .object({
    customerId: z.string().min(1, "Choose a customer"),
    priority: z.enum(priorities).default("NORMAL"),
    requiredDispatchAt: z.coerce.date({ error: "Choose a dispatch date" }),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(orderItemSchema).min(1, "Add at least one line").max(50),
  })
  .refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, {
    path: ["items"],
    message: "Each product can only appear once",
  });

export const orderUpdateSchema = z.object({
  priority: z.enum(priorities).optional(),
  requiredDispatchAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(orderItemSchema).min(1).max(50).optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(200).optional(),
});

export const orderAssignSchema = z.object({ shipmentId: z.string().min(1).nullable() });

export const orderQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: optionalEnum(orderStatuses),
  priority: optionalEnum(priorities),
  open: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  sort: z.enum(["number", "createdAt", "requiredDispatchAt", "priority", "status"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;
