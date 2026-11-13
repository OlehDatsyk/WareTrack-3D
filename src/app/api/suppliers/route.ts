import { db } from "@/server/db";
import { route } from "@/server/api/handler";
export const GET = route({ permission: "inventory:read" }, async () =>
  db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, country: true, leadTimeDays: true } }),
);
