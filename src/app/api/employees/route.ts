import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createEmployee, listEmployees } from "@/server/services/workforce";
import { employeeQuerySchema, employeeSchema } from "@/schemas/workforce";

export const GET = route({ permission: "workforce:read" }, async ({ query, warehouseId }) => listEmployees(db, await warehouseId(), query(employeeQuerySchema)));

export const POST = route({ permission: "workforce:write" }, async (ctx) => {
  const input = await ctx.json(employeeSchema);
  return createEmployee(db, await ctx.warehouseId(), input, actorOf(ctx));
});
