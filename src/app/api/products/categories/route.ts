import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listCategories } from "@/server/services/inventory";

export const GET = route({ permission: "inventory:read" }, async () => listCategories(db));
