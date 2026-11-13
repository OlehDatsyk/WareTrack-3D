import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { deleteEmployee, getEmployee, updateEmployee } from "@/server/services/workforce";
import { employeeUpdateSchema } from "@/schemas/workforce";

export const GET = route<{ id: string }>({ permission: "workforce:read" }, async ({ params, warehouseId }) => getEmployee(db, await warehouseId(), params.id));

export const PATCH = route<{ id: string }>({ permission: "workforce:write" }, async (ctx) => {
  const input = await ctx.json(employeeUpdateSchema);
  return updateEmployee(db, await ctx.warehouseId(), ctx.params.id, input, actorOf(ctx));
});

export const DELETE = route<{ id: string }>({ permission: "workforce:write" }, async (ctx) => deleteEmployee(db, await ctx.warehouseId(), ctx.params.id, actorOf(ctx)));
