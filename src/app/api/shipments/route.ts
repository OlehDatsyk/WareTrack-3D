import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { actorOf } from "@/server/api/actor";
import { createShipment, listShipments } from "@/server/services/shipments";
import { shipmentQuerySchema, shipmentSchema } from "@/schemas/shipments";

export const GET = route({ permission: "shipments:read" }, async ({ query, warehouseId }) => listShipments(db, await warehouseId(), query(shipmentQuerySchema)));

export const POST = route({ permission: "shipments:write" }, async (ctx) => {
  const input = await ctx.json(shipmentSchema);
  return createShipment(db, await ctx.warehouseId(), input, actorOf(ctx));
});
