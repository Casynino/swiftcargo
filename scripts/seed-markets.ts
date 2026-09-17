/**
 * Seeds the China markets directory with its opening set. Safe to run again.
 *
 *   npx tsx scripts/seed-markets.ts
 *
 * The list itself lives in prisma/data/markets.ts, which the production seed
 * reads too.
 */
import { PrismaClient } from "@prisma/client";

import { seedMarkets } from "../prisma/data/markets";

const prisma = new PrismaClient();

async function main() {
  const { added, total } = await seedMarkets(prisma);
  console.log(`Markets: ${total} published (${added} added this run)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
