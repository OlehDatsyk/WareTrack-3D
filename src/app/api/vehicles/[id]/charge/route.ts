import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { sendToCharge } from "@/server/services/fleet";

export const POST = route<{ id: string }>({ permission: "fleet:assign" }, async (ctx) =>
  sendToCharge(db, await ctx.warehouseId(), ctx.params.id, actorOf(ctx)),
);
