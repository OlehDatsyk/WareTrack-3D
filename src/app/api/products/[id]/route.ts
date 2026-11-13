import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { deleteProduct, getProductDetail, updateProduct } from "@/server/services/inventory";
import { productSchema } from "@/schemas/inventory";
import { z } from "zod";

export const GET = route<{ id: string }>({ permission: "inventory:read" }, async ({ params, warehouseId }) =>
  getProductDetail(db, await warehouseId(), params.id),
);

export const PATCH = route<{ id: string }>({ permission: "inventory:write" }, async (ctx) => {
  const input = await ctx.json(productSchema.partial().extend({ isActive: z.boolean().optional() }));
  return updateProduct(db, ctx.params.id, input, actorOf(ctx));
});

export const DELETE = route<{ id: string }>({ permission: "inventory:delete" }, async (ctx) => deleteProduct(db, ctx.params.id, actorOf(ctx)));
