import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runTick } from "../src/server/simulation/engine";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const wh = await prisma.warehouse.findFirstOrThrow({ where: { code: process.argv[2] ?? "WH-01" } });
  const ticks = Number(process.argv[3] ?? 10);
  let now = Date.now();
  for (let t = 1; t <= ticks; t++) {
    now += 4000;
    const ev = await runTick(prisma as never, wh.id, 1000 + t, 20261113, new Date(now));
    if (ev.length) console.log(`tick ${t}:`, ev.join(" | "));
  }
  const tasks = await prisma.task.groupBy({ by: ["status"], where: { warehouseId: wh.id }, _count: true });
  console.log(tasks);
}
main().finally(() => prisma.$disconnect());
