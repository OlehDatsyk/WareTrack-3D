import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listNotifications } from "@/server/services/notifications";
import { optionalEnum, paginationSchema } from "@/schemas/common";

const querySchema = paginationSchema.extend({
  status: z.enum(["all", "unread", "read"]).default("all"),
  category: optionalEnum(["INVENTORY", "ORDER", "SHIPMENT", "FLEET", "CAPACITY", "WORKFORCE", "SYSTEM"] as const),
  priority: optionalEnum(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const),
});

export const GET = route({ permission: "notifications:read" }, async ({ query, warehouseId, user }) => {
  const f = query(querySchema);
  return listNotifications(db, await warehouseId(), user, f);
});
