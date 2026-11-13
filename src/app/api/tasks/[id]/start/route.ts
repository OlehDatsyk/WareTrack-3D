import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { startTaskAction } from "@/server/services/tasks";
import { startTaskSchema } from "@/schemas/operations";

export const POST = route<{ id: string }>({ permission: "tasks:write" }, async (ctx) => {
  const input = await ctx.json(startTaskSchema);
  return startTaskAction(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});
