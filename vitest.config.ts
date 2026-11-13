import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";

const testDb = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside the React server runtime; it is a no-op in tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      ...(testDb ? { DATABASE_URL: testDb } : {}),
      SEED_DEMO_PASSWORD: "TestPassword#2026",
      NODE_ENV: "test",
    },
  },
});
