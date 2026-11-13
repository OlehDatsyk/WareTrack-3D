import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createZone, listZones } from "@/server/services/facility";
import { zoneSchema } from "@/schemas/operations";

export const GET = route({ permission: "zones:read" }, async ({ warehouseId }) => listZones(db, await warehouseId()));

export const POST = route({ permission: "zones:write" }, async (ctx) => {
  const input = await ctx.json(zoneSchema);
  return createZone(db, await ctx.warehouseId(), input, actorOf(ctx));
});
