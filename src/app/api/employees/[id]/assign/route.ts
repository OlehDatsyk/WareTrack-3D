import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { assignEmployeeToTask } from "@/server/services/workforce";
import { assignEmployeeTaskSchema } from "@/schemas/workforce";

export const POST = route<{ id: string }>({ permission: "tasks:write" }, async (ctx) => {
  const { taskId } = await ctx.json(assignEmployeeTaskSchema);
  return assignEmployeeToTask(db, await ctx.warehouseId(), ctx.params.id, taskId, actorOf(ctx));
});
