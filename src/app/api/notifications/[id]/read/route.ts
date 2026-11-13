import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { setRead } from "@/server/services/notifications";

export const POST = route<{ id: string }>({ permission: "notifications:read" }, async ({ params, json, warehouseId, user }) => {
  const { read } = await json(z.object({ read: z.boolean().default(true) }));
  return setRead(db, await warehouseId(), user.id, params.id, read);
});
