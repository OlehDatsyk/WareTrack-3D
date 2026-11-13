import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { completeTaskAction } from "@/server/services/tasks";

export const POST = route<{ id: string }>({ permission: "tasks:write" }, async (ctx) =>
  completeTaskAction(db, await ctx.warehouseId(), ctx.params.id, actorOf(ctx)),
);
