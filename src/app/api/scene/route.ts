import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getScene } from "@/server/services/scene";

export const GET = route({ permission: "zones:read" }, async ({ warehouseId }) => {
  return getScene(db, await warehouseId());
});
