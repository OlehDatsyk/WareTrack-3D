/**
 * Database connection settings shared by the app, the Prisma CLI and scripts.
 *
 * DATABASE_SCHEMA (optional) isolates all WareTrack tables in their own PostgreSQL
 * schema, so the app can safely share a database with other applications
 * (e.g. on Render, where a workspace can hold only one free Postgres instance).
 * Leave it unset to use the default `public` schema.
 */
import type { PoolConfig } from "pg";

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export function databaseSchema(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const schema = env.DATABASE_SCHEMA?.trim();
  if (!schema) return undefined;
  if (!SCHEMA_RE.test(schema)) {
    throw new Error("DATABASE_SCHEMA must be a lower-case identifier (letters, digits, underscores).");
  }
  return schema;
}

/** URL for the Prisma CLI (migrate/studio): adds `?schema=` when a schema is configured. */
export function prismaCliUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.DATABASE_URL;
  const schema = databaseSchema(env);
  if (!raw || !schema) return raw;
  const url = new URL(raw);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/** Pool config + adapter options for the runtime client (node-postgres + PrismaPg). */
export function runtimeDatabaseConfig(env: NodeJS.ProcessEnv = process.env): { pool: PoolConfig; adapter: { schema?: string } } {
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not configured. Copy .env.example to .env and set it.");
  const schema = databaseSchema(env);
  if (!schema) return { pool: { connectionString: raw }, adapter: {} };
  // Raw SQL (sequences, reports) resolves unqualified names through search_path.
  return { pool: { connectionString: raw, options: `-c search_path=${schema}` }, adapter: { schema } };
}
