import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseConfig } from "@/lib/database-url";

function createClient() {
  const config = runtimeDatabaseConfig();
  return new PrismaClient({ adapter: new PrismaPg(config.pool, config.adapter) });
}

type GlobalWithPrisma = typeof globalThis & { __waretrackPrisma?: PrismaClient };
const g = globalThis as GlobalWithPrisma;

/** Creates the client on first use, so importing this module never needs a database (e.g. during `next build`). */
function getClient(): PrismaClient {
  if (!g.__waretrackPrisma) g.__waretrackPrisma = createClient();
  return g.__waretrackPrisma;
}

/** Shared Prisma client (re-used across hot reloads in development). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
