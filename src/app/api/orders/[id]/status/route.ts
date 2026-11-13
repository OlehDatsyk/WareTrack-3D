import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { changeOrderStatus } from "@/server/services/orders";
import { orderStatusSchema } from "@/schemas/orders";

export const POST = route<{ id: string }>({ permission: "orders:status" }, async (ctx) => {
  const { status, note } = await ctx.json(orderStatusSchema);
  return changeOrderStatus(db, await ctx.warehouseId(), ctx.params.id, status, actorOf(ctx), note);
});
