import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { updateProfile } from "@/server/services/admin";
import { profileSchema } from "@/schemas/admin";

export const PATCH = route({}, async (ctx) => {
  const input = await ctx.json(profileSchema);
  return updateProfile(db, ctx.user.id, input, actorOf(ctx));
});
