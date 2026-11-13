import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getPallet } from "@/server/services/pallets";

export const GET = route<{ id: string }>({ permission: "inventory:read" }, async ({ params, warehouseId }) =>
  getPallet(db, await warehouseId(), params.id),
);
