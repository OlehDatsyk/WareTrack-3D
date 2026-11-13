import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { getWarehouseSettings, updateWarehouseSettings } from "@/server/services/admin";
import { warehouseSettingsSchema } from "@/schemas/admin";

export const GET = route<{ id: string }>({ permission: "dashboard:read" }, async ({ params }) => getWarehouseSettings(db, params.id));

export const PATCH = route<{ id: string }>({ permission: "settings:warehouse" }, async (ctx) => {
  const input = await ctx.json(warehouseSettingsSchema);
  return updateWarehouseSettings(db, ctx.params.id, input, actorOf(ctx));
});
