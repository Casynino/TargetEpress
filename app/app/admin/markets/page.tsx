import type { Metadata } from "next";

import { MarketsAdmin, type MarketRow } from "@/components/app/markets-admin";
import { PageHeader } from "@/components/app/page-header";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "China markets" };

export default async function MarketsAdminPage() {
  await requirePermission("pricing.manage");

  const markets = await prisma.chinaMarket.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const rows: MarketRow[] = markets.map((market) => ({
    id: market.id,
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
    verify: market.verify,
    sortOrder: market.sortOrder,
    active: market.active,
  }));

  return (
    <>
      <PageHeader
        title="China markets"
        description="What the support desk recommends, and what customers read before they book a flight."
      />
      <MarketsAdmin markets={rows} />
    </>
  );
}
