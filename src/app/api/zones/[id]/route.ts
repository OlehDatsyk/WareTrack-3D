import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { deleteZone, getZone, updateZone } from "@/server/services/facility";
import { zoneUpdateSchema } from "@/schemas/operations";

export const GET = route<{ id: string }>({ permission: "zones:read" }, async ({ params, warehouseId }) =>
  getZone(db, await warehouseId(), params.id),
);

export const PATCH = route<{ id: string }>({ permission: "zones:write" }, async (ctx) => {
  const input = await ctx.json(zoneUpdateSchema);
  return updateZone(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});

export const DELETE = route<{ id: string }>({ permission: "zones:write" }, async (ctx) =>
  deleteZone(db, await ctx.warehouseId(), ctx.params.id, actorOf(ctx)),
);
