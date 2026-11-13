import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { assignOrderToShipment } from "@/server/services/orders";
import { orderAssignSchema } from "@/schemas/orders";

export const POST = route<{ id: string }>({ permission: "orders:write" }, async (ctx) => {
  const { shipmentId } = await ctx.json(orderAssignSchema);
  return assignOrderToShipment(db, await ctx.warehouseId(), ctx.params.id, shipmentId, actorOf(ctx));
});
