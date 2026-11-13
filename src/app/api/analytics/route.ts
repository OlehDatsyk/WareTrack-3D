import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { getAnalytics } from "@/server/services/analytics";
import { optionalEnum, optionalString } from "@/schemas/common";

const q = z.object({
  days: z.coerce.number().int().refine((d) => [7, 14, 30, 90, 180].includes(d), "Unsupported range").default(30),
  category: optionalString,
  operation: optionalEnum(["RECEIPT", "PUTAWAY", "TRANSFER", "PICK", "ADJUSTMENT", "DAMAGE", "RETURN", "DISPATCH"] as const),
});

export const GET = route({ permission: "analytics:read" }, async ({ query, warehouseId }) => getAnalytics(db, await warehouseId(), query(q)));
