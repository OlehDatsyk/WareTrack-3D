import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { routeMap } from "@/server/services/shipments";

export const GET = route({ permission: "shipments:read" }, async ({ warehouseId }) => routeMap(db, await warehouseId()));
