import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { requestPalletMove } from "@/server/services/pallets";
import { movePalletSchema } from "@/schemas/operations";

export const POST = route<{ id: string }>({ permission: "inventory:adjust" }, async (ctx) => {
  const input = await ctx.json(movePalletSchema);
  return requestPalletMove(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
