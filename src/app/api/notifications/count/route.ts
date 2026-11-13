import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { countUnread } from "@/server/services/notifications";

export const GET = route({ permission: "notifications:read" }, async ({ warehouseId, user }) => {
  return countUnread(db, await warehouseId(), user);
});
