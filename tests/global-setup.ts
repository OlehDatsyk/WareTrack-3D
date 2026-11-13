import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Applies migrations to the dedicated test database once per run.
 * Integration suites reseed it themselves (see tests/helpers.ts).
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env (docker compose creates the waretrack_test database).");
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL — tests wipe it.");
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
