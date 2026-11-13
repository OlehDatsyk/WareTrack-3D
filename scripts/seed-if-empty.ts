/**
 * Seeds demo data only when the database has no users yet.
 * Safe to run on every deploy (Render pre-deploy command).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDatabase } from "../src/server/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const users = await prisma.user.count();
    if (users > 0) {
      console.log(`[seed-if-empty] ${users} users found — skipping demo seed.`);
      return;
    }
    if (process.env.SEED_DEMO_DATA === "false") {
      console.log("[seed-if-empty] SEED_DEMO_DATA=false — leaving the database empty.");
      return;
    }
    const password = process.env.SEED_DEMO_PASSWORD;
    if (!password || password.length < 10) {
      throw new Error("Set SEED_DEMO_PASSWORD (10+ characters) before seeding a deployed database.");
    }
    await seedDatabase(prisma, { password, log: (m) => console.log(`[seed-if-empty] ${m}`) });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
