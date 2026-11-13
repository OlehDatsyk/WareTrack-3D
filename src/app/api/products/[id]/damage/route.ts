import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { recordZoneDamage } from "@/server/services/inventory";
import { zoneDamageSchema } from "@/schemas/inventory";

export const POST = route<{ id: string }>({ permission: "inventory:adjust" }, async (ctx) => {
  const input = await ctx.json(zoneDamageSchema);
  return recordZoneDamage(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
