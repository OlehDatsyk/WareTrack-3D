import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createProduct, listInventory } from "@/server/services/inventory";
import { productQuerySchema, productSchema } from "@/schemas/inventory";

export const GET = route({ permission: "inventory:read" }, async ({ query, warehouseId }) =>
  listInventory(db, await warehouseId(), query(productQuerySchema)),
);

export const POST = route({ permission: "inventory:write" }, async (ctx) => {
  const input = await ctx.json(productSchema);
  return createProduct(db, input, actorOf(ctx));
});
