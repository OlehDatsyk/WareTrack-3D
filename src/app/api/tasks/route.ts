import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createManualTask, listTasks } from "@/server/services/tasks";
import { createTaskSchema } from "@/schemas/operations";
import { optionalEnum, paginationSchema } from "@/schemas/common";

const q = paginationSchema.extend({
  status: optionalEnum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OPEN"] as const),
  type: optionalEnum(["PUTAWAY", "PICK", "REPLENISH", "TRANSFER", "LOAD", "UNLOAD", "CYCLE_COUNT"] as const),
  vehicleId: z.string().optional(),
  assigneeId: z.string().optional(),
});

export const GET = route({ permission: "dashboard:read" }, async ({ query, warehouseId }) => listTasks(db, await warehouseId(), query(q)));

export const POST = route({ permission: "tasks:write" }, async (ctx) => {
  const input = await ctx.json(createTaskSchema);
  return createManualTask(db, await ctx.warehouseId(), input, actorOf(ctx));
});
