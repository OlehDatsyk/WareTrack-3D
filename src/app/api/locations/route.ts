import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listFreeLocations } from "@/server/services/pallets";

const q = z.object({
  zoneId: z.string().optional(),
  minWeightKg: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Free storage positions (no pallet, not blocked, zone usable, not reserved by a task). */
export const GET = route({ permission: "inventory:read" }, async ({ query, warehouseId }) => {
  const f = query(q);
  return listFreeLocations(db, await warehouseId(), f);
});
