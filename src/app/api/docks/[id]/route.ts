import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { getDock, setDockStatus } from "@/server/services/facility";

export const GET = route<{ id: string }>({ permission: "shipments:read" }, async ({ params, warehouseId }) =>
  getDock(db, await warehouseId(), params.id),
);

export const PATCH = route<{ id: string }>({ permission: "zones:write" }, async (ctx) => {
  const { status } = await ctx.json(z.object({ status: z.enum(["AVAILABLE", "MAINTENANCE"]) }));
  return setDockStatus(db, await ctx.warehouseId(), ctx.params.id, status, actorOf(ctx));
});
