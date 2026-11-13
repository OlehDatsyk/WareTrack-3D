import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getDashboard } from "@/server/services/dashboard";

export const GET = route({ permission: "dashboard:read" }, async ({ warehouseId }) => {
  return getDashboard(db, await warehouseId());
});
