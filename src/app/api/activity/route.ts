import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listActivity } from "@/server/services/admin";
import { activityQuerySchema } from "@/schemas/admin";

export const GET = route({ permission: "dashboard:read" }, async ({ query, warehouseId }) => listActivity(db, await warehouseId(), query(activityQuerySchema)));
