import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { markAllRead } from "@/server/services/notifications";

export const POST = route({ permission: "notifications:read" }, async ({ warehouseId, user }) => {
  return markAllRead(db, await warehouseId(), user.id);
});
