import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { setLocationBlocked } from "@/server/services/facility";

export const PATCH = route<{ id: string }>({ permission: "zones:write" }, async (ctx) => {
  const { isBlocked } = await ctx.json(z.object({ isBlocked: z.boolean() }));
  return setLocationBlocked(db, await ctx.warehouseId(), ctx.params.id, isBlocked, actorOf(ctx));
});
