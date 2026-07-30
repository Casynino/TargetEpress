import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  ProductCatalogue,
  PublishPriceForm,
  RateBook,
  type AdminProduct,
  type AdminRule,
} from "@/components/app/pricing-admin";
import { Badge } from "@/components/ui/badge";
import { currentRate } from "@/lib/fx";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Products & pricing" };

/**
 * The CEO's rate book.
 *
 * Restricted to pricing.manage — one role holds it. The screen leads with what
 * is *missing*, because an unpriced product is the failure people actually hit:
 * cargo gets registered in China and Finance cannot invoice it.
 */
export default async function PricingAdminPage() {
  await requirePermission("pricing.manage");

  const [products, rules, rate] = await Promise.all([
    prisma.cargoType.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        route: true,
        active: true,
        _count: { select: { pricingRules: { where: { active: true } } } },
      },
    }),
    prisma.pricingRule.findMany({
      orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }],
      take: 200,
      include: { cargoType: { select: { name: true } } },
    }),
    currentRate(),
  ]);

  const productRows: AdminProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    route: product.route,
    active: product.active,
    ruleCount: product._count.pricingRules,
  }));

  const ruleRows: AdminRule[] = rules.map((rule) => ({
    id: rule.id,
    category: rule.category,
    productName: rule.cargoType?.name ?? null,
    method: rule.method,
    price: rule.price.toString(),
    currency: rule.currency,
    minWeightKg: rule.minWeightKg?.toString() ?? null,
    maxWeightKg: rule.maxWeightKg?.toString() ?? null,
    minChargeableKg: rule.minChargeableKg?.toString() ?? null,
    minCharge: rule.minCharge?.toString() ?? null,
    notes: rule.notes,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    active: rule.active,
  }));

  // A category with no catch-all price and products that have none of their own
  // is a hole in the book. Say so at the top rather than letting a clerk find it.
  const liveRules = ruleRows.filter((r) => r.active);
  const categoriesWithCatchAll = new Set(
    liveRules.filter((r) => r.productName === null).map((r) => r.category)
  );
  const unpriced = productRows.filter(
    (p) => p.active && p.ruleCount === 0 && !categoriesWithCatchAll.has(p.category)
  );

  return (
    <>
      <PageHeader
        title="Products & pricing"
        description="The single source of every figure this business quotes. Yours alone to change."
        actions={
          <Link
            href="/app/finance/exchange-rate"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {rate
              ? `1 USD = ${toNumber(rate.rate).toLocaleString()} TZS`
              : "Set the exchange rate"}
          </Link>
        }
      />

      {unpriced.length > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium">
              {unpriced.length} product{unpriced.length === 1 ? "" : "s"} cannot be
              quoted
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cargo registered against these will reach Finance with no price.
              Publish a price for each, or a catch-all for its category.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unpriced.map((product) => (
                <Badge key={product.id} variant="outline" className="border-warning/40">
                  {product.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <RateBook rules={ruleRows} />
          <ProductCatalogue products={productRows} />
        </div>
        <div className="space-y-6">
          <PublishPriceForm products={productRows} />

          <section className="rounded-xl border bg-card p-4 text-sm shadow-soft">
            <h2 className="font-semibold">How a quote is resolved</h2>
            <ol className="mt-3 space-y-2 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span> A price
                naming that exact product, in the matching weight tier.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span> Failing
                that, the category catch-all for that tier.
              </li>
              <li>
                <span className="font-medium text-foreground">3.</span> Among
                equals, the most recently published wins.
              </li>
              <li>
                <span className="font-medium text-foreground">4.</span> Nothing
                matches — the quote comes back unpriced rather than guessing.
              </li>
            </ol>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Weight tiers are data, so the &ldquo;under 10 kg&rdquo; rule is a
              row in this table, not a line of code. Changing where the tier
              breaks is a price change, not a deployment.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
