import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getRack } from "@/server/services/facility";

export const GET = route<{ id: string }>({ permission: "zones:read" }, async ({ params, warehouseId }) =>
  getRack(db, await warehouseId(), params.id),
);
