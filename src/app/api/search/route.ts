import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { globalSearch } from "@/server/services/search";

export const GET = route({ permission: "dashboard:read" }, async ({ query, warehouseId }) => {
  const { q } = query(z.object({ q: z.string().max(80).default("") }));
  return globalSearch(db, await warehouseId(), q);
});
