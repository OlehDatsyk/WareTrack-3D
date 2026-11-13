import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createVehicle, listVehicles } from "@/server/services/fleet";
import { vehicleSchema, vehicleStatuses, vehicleTypes } from "@/schemas/fleet";
import { optionalEnum, optionalString, paginationSchema } from "@/schemas/common";

const q = paginationSchema.extend({
  type: optionalEnum(vehicleTypes),
  status: optionalEnum(vehicleStatuses),
  group: z.enum(["lifts", "road"]).optional(),
  q: optionalString,
});

export const GET = route({ permission: "fleet:read" }, async ({ query, warehouseId }) => listVehicles(db, await warehouseId(), query(q)));

export const POST = route({ permission: "fleet:write" }, async (ctx) => {
  const input = await ctx.json(vehicleSchema);
  return createVehicle(db, await ctx.warehouseId(), input, actorOf(ctx));
});
