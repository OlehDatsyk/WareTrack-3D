import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listAudit } from "@/server/services/admin";
import { auditQuerySchema } from "@/schemas/admin";

export const GET = route({ permission: "audit:read" }, async ({ query }) => listAudit(db, query(auditQuerySchema)));
