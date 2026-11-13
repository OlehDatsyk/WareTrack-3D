import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { assignShipmentToDock } from "@/server/services/facility";
import { assignDockSchema } from "@/schemas/operations";

export const POST = route<{ id: string }>({ permission: "shipments:write" }, async (ctx) => {
  const input = await ctx.json(assignDockSchema);
  return assignShipmentToDock(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
