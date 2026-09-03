import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  Boxes,
  Clock,
  History,
  Layers,
  TriangleAlert,
  UserCog,
} from "lucide-react";

import { ExchangeRateForm } from "@/components/app/exchange-rate-form";
import { FillInvoiceRates } from "@/components/app/fill-invoice-rates";
import { PageHeader } from "@/components/app/page-header";
import {
  ProductCatalogue,
  PublishPriceForm,
  RateBook,
  type AdminProduct,
  type AdminRule,
} from "@/components/app/pricing-admin";
import { Badge } from "@/components/ui/badge";
import { auditSentence } from "@/lib/audit-humanise";
import { CATEGORY_LABELS } from "@/lib/cargo";
import { formatDateTime, formatRelative, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Pricing & configuration") };
}

/**
 * Pricing & Configuration — the one place the business decides what it charges.
 *
 * Everything the quote engine reads lives here: the USD→TZS rate, the rate book
 * of per-kilo and per-item prices, and the product catalogue those prices hang
 * off. Nothing about a price is in code, which is the whole point — a price
 * change tomorrow is a Finance job, not a deploy.
 *
 * Two audiences, one page. `pricing.view` gets in and reads; every control that
 * writes is separately gated on `pricing.manage` or `fx.manage`, so Support can
 * answer "what will this cost" from the same numbers Finance bills from without
 * being able to move any of them. The gates are in the actions too — this page
 * decides what to render, never what is allowed.
 */
export default async function PricingConfigurationPage() {
  const user = await requirePermission("pricing.view");
  const locale = await viewerLocale();
  const canManage = can(user.role, "pricing.manage");
  const canSetRate = can(user.role, "fx.manage");

  const [products, rules, rate, rateHistory, lastChanges] = await Promise.all([
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
    prisma.exchangeRate.findMany({
      orderBy: { effectiveFrom: "desc" },
      take: 8,
      select: {
        id: true,
        rate: true,
        effectiveFrom: true,
        notes: true,
        setBy: { select: { name: true } },
      },
    }),
    // Every change to what the business charges, in one register. The audit log
    // already records all of it; this is the window onto it, so nobody has to
    // hold audit.view to see who moved a price.
    //
    // These strings must match what the actions actually write, exactly:
    // lib/actions/fx.ts:70 and lib/actions/pricing.ts:142, :197, :293, :347.
    // They are the only link between the two files, and a mismatch is silent —
    // the panel simply renders one row fewer, so the change nobody can see is
    // the change nobody knows to question.
    prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "fx.setRate",
            "pricing.publishRule",
            "pricing.withdrawRule",
            "pricing.createProduct",
            "pricing.archiveProduct",
            "pricing.restoreProduct",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
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

  const liveRules = ruleRows.filter((r) => r.active);
  const categoriesWithCatchAll = new Set(
    liveRules.filter((r) => r.productName === null).map((r) => r.category)
  );
  // A product nobody has priced, in a category with no catch-all, is a hole in
  // the book — cargo registered against it reaches Finance unpriceable.
  const unpriced = productRows.filter(
    (p) => p.active && p.ruleCount === 0 && !categoriesWithCatchAll.has(p.category)
  );

  const lastPriceChange = rules.find((r) => r.active) ?? rules[0] ?? null;
  const liveRate = rateHistory[0] ?? null;
  const activeCategories = new Set(liveRules.map((r) => r.category)).size;

  const cards = [
    {
      icon: ArrowLeftRight,
      label: t(locale, "Exchange rate"),
      value: rate
        ? `1 USD = ${toNumber(rate.rate).toLocaleString()} TZS`
        : t(locale, "Not set"),
      sub: liveRate
        ? `${t(locale, "Set")} ${formatRelative(liveRate.effectiveFrom, locale)}`
        : t(locale, "Every invoice needs one"),
      tone: rate ? "text-brand" : "text-destructive",
    },
    {
      icon: Layers,
      label: t(locale, "Active categories"),
      value: String(activeCategories),
      sub: `${t(locale, "of")} ${Object.keys(CATEGORY_LABELS).length} ${t(locale, "priced")}`,
      tone: "text-foreground",
    },
    {
      icon: Boxes,
      label: t(locale, "Products configured"),
      value: String(productRows.filter((p) => p.active).length),
      sub: unpriced.length
        ? `${unpriced.length} ${t(locale, "with no price")}`
        : t(locale, "All priced"),
      tone: unpriced.length ? "text-warning" : "text-success",
    },
    {
      icon: Clock,
      label: t(locale, "Last price change"),
      value: lastPriceChange
        ? formatRelative(lastPriceChange.effectiveFrom, locale)
        : t(locale, "Never"),
      sub: lastPriceChange
        ? formatDateTime(lastPriceChange.effectiveFrom, locale)
        : t(locale, "No rule published yet"),
      tone: "text-foreground",
    },
    {
      icon: UserCog,
      label: t(locale, "Rate last set by"),
      value: liveRate?.setBy?.name ?? "—",
      sub: liveRate
        ? formatDateTime(liveRate.effectiveFrom, locale)
        : t(locale, "No rate on record"),
      tone: "text-foreground",
    },
  ];

  return (
    <>
      <PageHeader
        title="Pricing & configuration"
        description="Every figure this business quotes comes from this page. Change it here and the whole system follows — cargo, invoices, tracking and reports."
      />

      {/*
        No tab row. This page stands on its own.

        The rate book is not a view of the money — it is the machine that sets
        every figure the money pages then report, and it is opened deliberately
        from the sidebar rather than wandered into while reading a ledger. On the
        support desk the row showed only Collections and Credit beside it, which
        made a page that governs the whole system look like a third tab of
        somebody else's workspace.
      */}

      {/* A bill with no rate is a fault this page is responsible for, because
          this page is where rates are published. It shows itself only when
          there are any. */}
      {canManage ? (
        <div className="mb-6">
          <FillInvoiceRates />
        </div>
      ) : null}

      {!canManage ? (
        <p className="mb-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t(
            locale,
            "You can read the rate book and the exchange rate here. Changing them is Finance’s, so nothing on this page is editable for you."
          )}
        </p>
      ) : null}

      <dl className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <card.icon className={`h-3.5 w-3.5 ${card.tone}`} />
              {card.label}
            </dt>
            <dd className="mt-1 font-display text-lg font-bold tabular-nums">
              {card.value}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </dl>

      {unpriced.length > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium">
              {unpriced.length}{" "}
              {t(locale, unpriced.length === 1 ? "product" : "products")}{" "}
              {t(locale, "cannot be quoted")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t(
                locale,
                "Cargo registered against these reaches Finance with no price. Give it a price, or archive it if the business does not carry it — either clears this."
              )}
            </p>
            {/* Each one is the fix, not a label of the problem: it opens the
                publish form with that product already chosen. */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unpriced.map((product) => (
                <Link
                  key={product.id}
                  href={`/app/finance/pricing?price=${product.id}`}
                  scroll={false}
                  className="focus-ring rounded-full border border-warning/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-warning/10"
                >
                  {t(locale, "Set a price for")} {product.name} →
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <RateBook rules={ruleRows} />
          <ProductCatalogue products={productRows} />
        </div>

        <div className="space-y-6">
          {/* The rate first: it is the one figure that touches every invoice,
              and the one most likely to be changed on any given morning. */}
          <section className="rounded-xl border bg-card shadow-soft">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">{t(locale, "Exchange rate")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(
                  locale,
                  "Applied to every invoice raised from now on. Invoices already issued keep the rate they were raised at."
                )}
              </p>
            </div>
            <div className="p-5">
              {canSetRate ? (
                <ExchangeRateForm current={rate ? toNumber(rate.rate) : null} />
              ) : (
                <p className="font-display text-2xl font-bold tabular-nums">
                  {rate
                    ? `1 USD = ${toNumber(rate.rate).toLocaleString()} TZS`
                    : t(locale, "Not set")}
                </p>
              )}
            </div>

            {rateHistory.length > 1 ? (
              <div className="border-t">
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(locale, "Previous rates")}
                </p>
                <ul className="divide-y px-5 pb-4 pt-2">
                  {rateHistory.slice(1).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                    >
                      <span className="font-mono tabular-nums">
                        {toNumber(entry.rate).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.setBy?.name ?? "—"} ·{" "}
                        {formatRelative(entry.effectiveFrom, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {canManage ? <PublishPriceForm products={productRows} /> : null}

          {/* Nothing disappears. Every change to what the business charges is
              on the record, and readable here without holding audit.view. */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold">
              <History className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Configuration history")}
            </h2>
            {lastChanges.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(locale, "Nothing has been changed yet.")}
              </p>
            ) : (
              <ul className="divide-y">
                {lastChanges.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <p className="text-sm">{auditSentence(locale, entry)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actor?.name ?? t(locale, "System")} ·{" "}
                      {formatRelative(entry.createdAt, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
