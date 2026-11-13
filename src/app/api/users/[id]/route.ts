import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { updateUser } from "@/server/services/admin";
import { updateUserSchema } from "@/schemas/admin";

export const PATCH = route<{ id: string }>({ permission: "users:manage" }, async (ctx) => {
  const input = await ctx.json(updateUserSchema);
  return updateUser(db, ctx.params.id, input, actorOf(ctx));
});
