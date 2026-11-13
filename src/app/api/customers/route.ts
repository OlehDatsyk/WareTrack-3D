import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { listCustomers } from "@/server/services/shipments";

export const GET = route({ permission: "orders:read" }, async () => listCustomers(db));
