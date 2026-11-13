import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createUser, listUsers } from "@/server/services/admin";
import { createUserSchema } from "@/schemas/admin";

export const GET = route({ permission: "users:manage" }, async () => listUsers(db));

export const POST = route({ permission: "users:manage" }, async (ctx) => {
  const input = await ctx.json(createUserSchema);
  return createUser(db, input, actorOf(ctx));
});
