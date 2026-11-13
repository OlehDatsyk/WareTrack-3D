import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { inventoryCsv } from "@/server/services/inventory";
import { productQuerySchema } from "@/schemas/inventory";
import { audit } from "@/server/audit";

export const GET = route({ permission: "inventory:read" }, async (ctx) => {
  const csv = await inventoryCsv(db, await ctx.warehouseId(), ctx.query(productQuerySchema));
  await audit(db, { userId: ctx.user.id, action: "inventory.export", entityType: "Product", ip: ctx.ip });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
