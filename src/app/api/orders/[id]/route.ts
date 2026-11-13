import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { getOrder, updateOrder } from "@/server/services/orders";
import { orderUpdateSchema } from "@/schemas/orders";

export const GET = route<{ id: string }>({ permission: "orders:read" }, async ({ params, warehouseId }) => getOrder(db, await warehouseId(), params.id));

export const PATCH = route<{ id: string }>({ permission: "orders:write" }, async (ctx) => {
  const input = await ctx.json(orderUpdateSchema);
  return updateOrder(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
