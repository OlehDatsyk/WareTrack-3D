import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { deleteVehicle, getVehicle, updateVehicle } from "@/server/services/fleet";
import { vehicleUpdateSchema } from "@/schemas/fleet";

export const GET = route<{ id: string }>({ permission: "fleet:read" }, async ({ params, warehouseId }) =>
  getVehicle(db, await warehouseId(), params.id),
);

export const PATCH = route<{ id: string }>({ permission: "fleet:write" }, async (ctx) => {
  const input = await ctx.json(vehicleUpdateSchema);
  return updateVehicle(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});

export const DELETE = route<{ id: string }>({ permission: "fleet:write" }, async (ctx) =>
  deleteVehicle(db, await ctx.warehouseId(), ctx.params.id, actorOf(ctx)),
);
