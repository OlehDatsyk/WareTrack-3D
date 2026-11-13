import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { addMaintenance } from "@/server/services/fleet";
import { maintenanceSchema } from "@/schemas/fleet";

export const POST = route<{ id: string }>({ permission: "fleet:write" }, async (ctx) => {
  const input = await ctx.json(maintenanceSchema);
  return addMaintenance(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
