import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDatabase } from "../src/server/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const started = Date.now();
  try {
    await seedDatabase(prisma, {
      password: process.env.SEED_DEMO_PASSWORD || "WareTrack#2026",
      log: (m) => console.log(`[seed] ${m}`),
    });
    console.log(`[seed] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
