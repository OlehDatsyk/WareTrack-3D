import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export const GET = route({}, async ({ user }) => {
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, city: true },
  });
  return { user, permissions: [...ROLE_PERMISSIONS[user.role]], warehouses };
});
