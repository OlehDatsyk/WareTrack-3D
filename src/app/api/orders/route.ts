import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createOrder, listOrders } from "@/server/services/orders";
import { orderQuerySchema, orderSchema } from "@/schemas/orders";

export const GET = route({ permission: "orders:read" }, async ({ query, warehouseId }) => listOrders(db, await warehouseId(), query(orderQuerySchema)));

export const POST = route({ permission: "orders:write" }, async (ctx) => {
  const input = await ctx.json(orderSchema);
  return createOrder(db, await ctx.warehouseId(), input, actorOf(ctx));
});
