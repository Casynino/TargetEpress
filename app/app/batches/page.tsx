import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package, Plane } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { BATCH_STATUS_META } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Batches" };

const ROUTE_LABEL: Record<string, string> = {
  GUANGZHOU: "Guangzhou Batch",
  HONG_KONG: "Hong Kong Batch",
};

const ROUTE_TAKES: Record<string, string> = {
  GUANGZHOU: "Normal goods",
  HONG_KONG: "Electronics, liquid and special goods",
};

/**
 * The two loading tables.
 *
 * This page is the live work area and nothing else — what is waiting in China
 * right now. There are exactly two, they are permanent, and they cannot be
 * created or deleted. Everything that has already left is in Shipments.
 *
 * The old design listed every batch ever opened, which meant the screen the
 * warehouse looks at most got longer every week and less useful every week.
 */
export default async function BatchesPage() {
  const user = await requirePermission("batch.view");
  const locale = await viewerLocale();
  const canDispatch = can(user.role, "shipment.depart");

  const tables = await prisma.batch.findMany({
    where: { permanent: true },
    orderBy: { origin: "asc" },
    select: {
      id: true,
      origin: true,
      shipments: {
        where: { status: "READY_TO_DEPART" },
        select: { weightKg: true, packages: true, registeredAt: true },
      },
    },
  });

  const recent = await prisma.batch.findMany({
    where: { permanent: false },
    orderBy: { departedAt: "desc" },
    take: 3,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      _count: { select: { shipments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Batches"
        description="The two loading tables. Cargo waiting to leave China, and nothing else."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {tables.map((table) => {
          const weight = table.shipments.reduce(
            (sum, cargo) => sum + toNumber(cargo.weightKg),
            0
          );
          const packages = table.shipments.reduce(
            (sum, cargo) => sum + cargo.packages,
            0
          );
          const oldest = table.shipments.reduce<Date | null>(
            (earliest, cargo) =>
              !earliest || cargo.registeredAt < earliest
                ? cargo.registeredAt
                : earliest,
            null
          );

          return (
            <section
              key={table.id}
              className="flex flex-col rounded-xl border bg-card shadow-soft"
            >
              <header className="flex items-start justify-between gap-3 border-b p-5">
                <div>
                  <h2 className="font-display text-lg font-bold">
                    {t(locale, ROUTE_LABEL[table.origin])}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t(locale, "Takes")}{" "}
                    {t(locale, ROUTE_TAKES[table.origin]).toLowerCase()}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    table.origin === "HONG_KONG"
                      ? "bg-info/10 text-info"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  <Plane className="h-3 w-3" />
                  {table.origin === "HONG_KONG"
                    ? t(locale, "Hong Kong")
                    : t(locale, "Guangzhou")}
                </span>
              </header>

              <div className="flex-1 p-5">
                {table.shipments.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Package className="mx-auto h-6 w-6 text-muted-foreground/50" />
                    <p className="mt-2 text-sm font-medium">{t(locale, "Empty")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(locale, "Ready for the next cargo.")}
                    </p>
                  </div>
                ) : (
                  <dl className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t(locale, "Pieces")}
                      </dt>
                      <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                        {table.shipments.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t(locale, "Packages")}
                      </dt>
                      <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                        {packages}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t(locale, "Weight")}
                      </dt>
                      <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                        {weight.toFixed(0)}
                        <span className="ml-1 text-sm font-medium text-muted-foreground">
                          {t(locale, "kg")}
                        </span>
                      </dd>
                    </div>
                  </dl>
                )}

                {oldest ? (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    {t(locale, "Oldest piece received")}{" "}
                    {formatDate(oldest, locale)}
                  </p>
                ) : null}
              </div>

              <footer className="border-t p-4">
                <Link
                  href={`/app/batches/${table.id}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  {canDispatch && table.shipments.length > 0
                    ? t(locale, "Review and dispatch")
                    : t(locale, "Open batch")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </footer>
            </section>
          );
        })}
      </div>

      {recent.length > 0 ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t(locale, "Recently dispatched")}
            </h2>
            <Link
              href="/app/shipments"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              {t(locale, "All batches")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
            {recent.map((dispatch) => (
              <li key={dispatch.id}>
                <Link
                  href={`/app/shipments/${dispatch.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                >
                  <span className="font-mono text-sm font-medium">
                    {dispatch.batchNumber}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {dispatch._count.shipments} {t(locale, "pieces")} ·{" "}
                    {/*
                      The shared status wording, not the enum spelled out.

                      Prettifying the enum produced words — "verified",
                      "arrived" — that no dictionary key owns, so this row was
                      the one place a Chinese screen still said the state in
                      English. The meta label is the phrase the badge on the
                      batch already uses and is already translated; lowercasing
                      after the lookup keeps the English reading as it did and
                      does nothing to Chinese.
                    */}
                    {t(locale, BATCH_STATUS_META[dispatch.status].label).toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
