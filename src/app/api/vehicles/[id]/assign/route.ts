import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { assignTaskToVehicle } from "@/server/services/fleet";
import { assignTaskToVehicleSchema } from "@/schemas/operations";

export const POST = route<{ id: string }>({ permission: "fleet:assign" }, async (ctx) => {
  const { taskId } = await ctx.json(assignTaskToVehicleSchema);
  return assignTaskToVehicle(db, await ctx.warehouseId(), ctx.params.id, taskId, actorOf(ctx));
});
