import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getShipment } from "@/server/services/shipments";

export const GET = route<{ id: string }>({ permission: "shipments:read" }, async ({ params, warehouseId }) => getShipment(db, await warehouseId(), params.id));
