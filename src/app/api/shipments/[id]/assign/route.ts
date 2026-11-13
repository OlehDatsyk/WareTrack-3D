import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { assignShipmentResources } from "@/server/services/shipments";
import { shipmentAssignSchema } from "@/schemas/shipments";

export const POST = route<{ id: string }>({ permission: "shipments:write" }, async (ctx) => {
  const input = await ctx.json(shipmentAssignSchema);
  return assignShipmentResources(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
