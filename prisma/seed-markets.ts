/**
 * Seeds the China markets directory from the written content.
 *
 *   npx tsx prisma/seed-markets.ts
 *
 * Fills gaps only — it never overwrites a market the CEO has since edited,
 * which is the whole reason the directory moved into the database.
 */
import { PrismaClient } from "@prisma/client";

import { MARKETS } from "../lib/markets";

const prisma = new PrismaClient();

async function main() {
  let added = 0;

  for (const [index, market] of MARKETS.entries()) {
    const existing = await prisma.chinaMarket.findUnique({
      where: { slug: market.slug },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.chinaMarket.create({
      data: {
        slug: market.slug,
        name: market.name,
        nameCn: market.nameCn,
        city: market.city,
        district: market.district,
        route: market.route,
        hours: market.hours,
        bestFor: market.bestFor,
        summary: market.summary,
        products: market.products,
        tips: market.tips,
        verify: market.verify ?? null,
        sortOrder: index,
      },
    });
    added++;
  }

  const total = await prisma.chinaMarket.count({ where: { active: true } });
  console.log(`Markets: ${total} active (${added} added this run)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
