import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Camera,
  ClipboardCheck,
  Hourglass,
  Package,
  PackageCheck,
  PackagePlus,
  Plane,
  ScanLine,
  Timer,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { Donut, DonutLegend } from "@/components/charts/donut";
import { FlowBars } from "@/components/charts/flow-bars";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { WarehouseFlowChart } from "@/components/app/warehouse-flow-chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXCEPTION_TYPE_LABELS, formatPackages } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import {
  chinaAgeing,
  chinaComposition,
  chinaFlowByDay,
  chinaProblems,
} from "@/lib/floor";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import {
  FLOW_WEEKS,
  PERIODS,
  parsePeriod,
  periodLabel,
  warehouseReport,
  type Spread,
} from "@/lib/warehouse-reports";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reports" };

/**
 * Days need one decimal to be useful and no more to be honest.
 *
 * The unit is carried in the reader's language: a figure and its unit are one
 * phrase, and "3.4 days" under a Chinese heading is a figure nobody can read.
 */
function days(locale: Locale, value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return `${Math.round(value * 24)} ${t(locale, "hrs")}`;
  return `${value.toFixed(1)} ${t(locale, "days")}`;
}

/**
 * The period switch's own label, in the reader's language.
 *
 * Every counted sentence on this page hangs off it — "booked in over the 30
 * days" and "近 30 天登记入库" are the same sentence with the window sitting in
 * a different place, so each one is written out whole rather than glued
 * together from translated halves.
 */
function windowLabel(locale: Locale, periodDays: number): string {
  return t(locale, periodLabel(periodDays).toLowerCase());
}

/**
 * One timing metric, with the sample size it rests on.
 *
 * A median next to an average is not clutter here: a single crate nobody
 * collected for months moves the average and leaves the median alone, and the
 * gap between them is the story. Under five completed journeys nothing is
 * claimed at all.
 */
function TimingRow({
  label,
  note,
  spread,
  owner,
  locale,
}: {
  label: string;
  note: string;
  spread: Spread;
  owner: string;
  /** Passed in: a plain helper cannot await `viewerLocale()` itself. */
  locale: Locale;
}) {
  const thin = spread.sample > 0 && spread.sample < 5;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
        <p className="font-display text-xl font-bold tabular">
          {days(locale, spread.average)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="muted">{owner}</Badge>
        {spread.sample === 0 ? (
          <span>{t(locale, "No completed journeys in this window.")}</span>
        ) : (
          <>
            <span className="tabular">
              {t(locale, "median")} {days(locale, spread.median)}
            </span>
            <span className="tabular">
              {t(locale, "longest")} {days(locale, spread.longest)}
            </span>
            <span className={cn("tabular", thin && "text-warning")}>
              {locale === "zh"
                ? `样本 ${spread.sample} 票${thin ? "（太少，看不出趋势）" : ""}`
                : `${spread.sample} measured${thin ? " — too few to read as a trend" : ""}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default async function WarehouseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("warehouse.reports");

  const { period } = await searchParams;
  const periodDays = parsePeriod(period);

  /**
   * Guangzhou reads its own floor, not Dar's.
   *
   * Everything below this line is built from the receiving and release record —
   * arrivedAt, deliveredAt, who checked what in — and China performs none of
   * those actions. Handing that report to the desk that registers cargo would
   * be somebody else's day in a nice box, which is the same mistake the
   * warehouse banner used to make with its chips.
   */
  if (user.role === "CHINA_WAREHOUSE") {
    return <ChinaReport periodDays={periodDays} />;
  }

  const locale = await viewerLocale();
  const report = await warehouseReport(periodDays, locale);
  const window = windowLabel(locale, periodDays);
  const zh = locale === "zh";

  const { throughput, speed, quality, staff, holding } = report;
  const netChange = throughput.shipmentsCheckedIn - throughput.released;

  return (
    <>
      <PageHeader
        title={t(locale, "Warehouse reports")}
        description={t(
          locale,
          "What the Dar floor moved, how long it took and what went wrong — measured from the receiving and release record itself."
        )}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {PERIODS.map((option) => (
              <Link
                key={option.days}
                href={`/app/reports?period=${option.days}`}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5 text-sm transition-colors",
                  option.days === periodDays
                    ? "bg-brand text-brand-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(locale, option.label)}
              </Link>
            ))}
          </div>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {zh ? `吞吐量 · 近 ${window}` : `Throughput · last ${window}`}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t(locale, "Cargo checked in")}
            value={throughput.shipmentsCheckedIn}
            hint={
              zh
                ? `${throughput.packagesCheckedIn.toLocaleString()} 箱 · ${formatWeight(throughput.weightCheckedInKg)}`
                : `${throughput.packagesCheckedIn.toLocaleString()} boxes · ${formatWeight(throughput.weightCheckedInKg)}`
            }
            icon={PackageCheck}
            tone="brand"
          />
          <StatCard
            label={t(locale, "Released to customers")}
            value={throughput.released}
            hint={
              netChange === 0
                ? t(locale, "In and out balanced over the window")
                : netChange > 0
                  ? zh
                    ? `入库比出库多 ${netChange} 票，在库量在上升`
                    : `${netChange} more in than out — the floor is filling`
                  : zh
                    ? `出库比入库多 ${Math.abs(netChange)} 票，积压正在消化`
                    : `${Math.abs(netChange)} more out than in — backlog clearing`
            }
            icon={Truck}
            tone="success"
          />
          <StatCard
            label={t(locale, "Held in the warehouse")}
            value={holding.total}
            hint={
              zh
                ? `${holding.awaitingPayment} 票待付款 · ${holding.readyForPickup} 票可提货 · ${formatWeight(holding.weightKg)}`
                : `${holding.awaitingPayment} awaiting payment · ${holding.readyForPickup} ready · ${formatWeight(holding.weightKg)}`
            }
            icon={Warehouse}
            tone={holding.total > 0 ? "info" : "neutral"}
            href="/app/inventory"
          />
          <StatCard
            label={t(locale, "Check failure rate")}
            value={
              quality.exceptionRate === null
                ? "—"
                : `${quality.exceptionRate.toFixed(1)}%`
            }
            hint={
              quality.checksTotal === 0
                ? t(locale, "No cargo checked in this window")
                : zh
                  ? `${quality.checksTotal} 次清单核对中有 ${quality.checksFlagged} 次报异常`
                  : `${quality.checksFlagged} of ${quality.checksTotal} manifest checks flagged`
            }
            icon={AlertTriangle}
            tone={
              quality.exceptionRate !== null && quality.exceptionRate >= 5
                ? "danger"
                : "neutral"
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <h2 className="font-display font-semibold">
              {t(locale, "Cargo received per week")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {zh
                ? `近 ${FLOW_WEEKS} 周，与同期出库量对照`
                : `Last ${FLOW_WEEKS} weeks, against what went out the door`}
            </p>
          </div>
          <div className="p-5">
            <WarehouseFlowChart weeks={report.weeks} />
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {t(
              locale,
              "A week is counted on the date each consignment was checked in against its manifest, and each release on the date it was handed over. Independent of the period switch above."
            )}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <Timer className="h-4 w-4" />
            {t(locale, "How long each leg takes")}
          </h2>
          <div className="divide-y">
            <TimingRow
              locale={locale}
              label={t(locale, "Landing to checked in")}
              note={t(
                locale,
                "Batch arrived until the boxes were ticked off the manifest."
              )}
              spread={speed.checkInLag}
              owner={t(locale, "Our clock")}
            />
            <TimingRow
              locale={locale}
              label={t(locale, "Checked in to cleared for pickup")}
              note={t(
                locale,
                "Waiting on the invoice being settled and the pickup note issued."
              )}
              spread={speed.arrivalToCleared}
              owner={t(locale, "Finance")}
            />
            <TimingRow
              locale={locale}
              label={t(locale, "Cleared to collected")}
              note={t(
                locale,
                "Sitting on the floor waiting for the customer to come."
              )}
              spread={speed.clearedToCollection}
              owner={t(locale, "Customer")}
            />
            <TimingRow
              locale={locale}
              label={t(locale, "Arrival to collection")}
              note={t(
                locale,
                "The whole time cargo spends in this warehouse, end to end."
              )}
              spread={speed.arrivalToCollection}
              owner={t(locale, "All three")}
            />
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {zh
              ? `按近 ${window}已提走的货计算。`
              : `Measured on cargo collected in the last ${window}. `}
            {t(
              locale,
              "The three legs are kept apart on purpose — a customer who takes a fortnight to collect is not a slow warehouse."
            )}
          </p>
        </div>

        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <ClipboardCheck className="h-4 w-4" />
            {t(locale, "What went wrong")}
          </h2>

          <div className="grid grid-cols-3 divide-x border-b">
            <div className="px-5 py-4">
              <p className="font-display text-xl font-bold tabular">
                {quality.checksTotal}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "Manifest checks")}
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className={cn(
                  "font-display text-xl font-bold tabular",
                  quality.exceptionsRaised > 0 && "text-warning"
                )}
              >
                {quality.exceptionsRaised}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "Exceptions raised")}
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className={cn(
                  "font-display text-xl font-bold tabular",
                  quality.exceptionsOpen > 0 && "text-destructive"
                )}
              >
                {quality.exceptionsOpen}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "Still open")}
              </p>
            </div>
          </div>

          {quality.exceptionTypes.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ClipboardCheck}
                title={t(locale, "Nothing flagged")}
                description={
                  zh
                    ? `近 ${window}入库的每一票货都与清单相符。`
                    : `Every consignment checked in over the last ${window} matched its manifest.`
                }
              />
            </div>
          ) : (
            <ul className="divide-y">
              {quality.exceptionTypes.map((row) => (
                <li
                  key={row.type}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm">
                    {t(locale, EXCEPTION_TYPE_LABELS[row.type])}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground tabular">
                    {row.open > 0 ? (
                      <Badge variant="warning">
                        {zh ? `${row.open} 未处理` : `${row.open} open`}
                      </Badge>
                    ) : null}
                    {row.total}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {quality.shortPackages > 0 ? (
              zh ? (
                <>
                  已入库的货仍缺{" "}
                  <strong className="font-semibold text-foreground">
                    {quality.shortPackages}
                  </strong>{" "}
                  箱，找齐之前这些货不能放行。{" "}
                </>
              ) : (
                <>
                  <strong className="font-semibold text-foreground">
                    {quality.shortPackages}
                  </strong>{" "}
                  {quality.shortPackages === 1 ? "box is" : "boxes are"} still
                  missing off cargo already on the floor — those consignments
                  cannot be released until they are found.{" "}
                </>
              )
            ) : (
              `${t(locale, "No cargo on the floor is short a box.")} `
            )}
            <Link href="/app/exceptions" className="text-brand hover:underline">
              {t(locale, "Open exceptions")}
            </Link>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <Users className="h-4 w-4" />
            {t(locale, "Who did the work")}
          </h2>
          {staff.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t(locale, "No floor activity recorded in this window")}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Name")}</TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Released")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Cargo checked in")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Boxes checked in")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Exceptions raised")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="text-sm font-medium">
                      {person.name}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.released}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.shipmentsCheckedIn}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.packagesCheckedIn}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.exceptionsRaised}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {zh ? `按近 ${window}统计。` : `Counted over the last ${window}. `}
            {t(
              locale,
              "Raising an exception is doing the job properly, not a mark against anyone — a desk that never flags anything is a desk that is not looking."
            )}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <Hourglass className="h-4 w-4" />
              {t(locale, "Longest held, still on the floor")}
            </h2>
            <Link
              href="/app/inventory"
              className="text-xs text-brand hover:underline"
            >
              {t(locale, "Full inventory")}
            </Link>
          </div>
          {holding.oldest.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Boxes}
                title={t(locale, "The floor is clear")}
                description={t(
                  locale,
                  "Nothing is being held at the Dar warehouse."
                )}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Tracking")}</TableHead>
                  <TableHead>{t(locale, "Customer")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t(locale, "Checked in")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t(locale, "Cargo")}
                  </TableHead>
                  <TableHead>{t(locale, "State")}</TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Days held")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holding.oldest.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${row.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {row.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{row.customerName}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDate(row.arrivedAt, locale)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatPackages(row.packages, row.packageType, locale)}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular",
                        row.daysHeld >= 30 && "text-destructive"
                      )}
                    >
                      {Math.floor(row.daysHeld)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel-inset px-5 py-4">
          <h2 className="text-sm font-semibold">
            {t(locale, "What this page does not measure")}
          </h2>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">
                {t(locale, "Anything in money.")}
              </strong>{" "}
              {t(
                locale,
                "Freight charges, storage fees, invoices and outstanding balances belong to Finance and are not shown to warehouse staff anywhere in this app, including here."
              )}
            </li>
            <li>
              <strong className="font-medium text-foreground">
                {t(locale, "Damage cost or write-off value.")}
              </strong>{" "}
              {t(
                locale,
                "A damaged-cargo exception records what was damaged, never what it was worth, so any figure would be invented."
              )}
            </li>
            <li>
              <strong className="font-medium text-foreground">
                {t(locale, "A collection deadline.")}
              </strong>{" "}
              {t(
                locale,
                'Nothing in the system promises a customer a collection date, so "days held" is reported as it is rather than dressed up as an on-time percentage.'
              )}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 border-t pt-3 text-xs">
            <Link href="/app/deliveries" className="text-brand hover:underline">
              <Package className="mr-1 inline h-3 w-3" />
              {t(locale, "Collected cargo")}
            </Link>
            <Link href="/app/receive" className="text-brand hover:underline">
              <ScanLine className="mr-1 inline h-3 w-3" />
              {t(locale, "Incoming cargo")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * What the Guangzhou desk did, measured from its own record.
 *
 * The Dar report answers "what did the floor move and how long did it hold it".
 * This one answers the questions that belong to a desk that registers and loads:
 * how much came in, how much flew, what is still standing, and whether the
 * photograph rule is actually being kept.
 *
 * No money anywhere, same as the Dar report. Warehouse staff see cargo and time.
 */
async function ChinaReport({ periodDays }: { periodDays: number }) {
  const locale = await viewerLocale();
  const since = new Date(Date.now() - periodDays * 86_400_000);

  const [registered, flown, composition, ageing, throughput, problems] =
    await Promise.all([
      prisma.shipment.aggregate({
        where: { deletedAt: null, registeredAt: { gte: since } },
        _count: true,
        _sum: { weightKg: true, packages: true },
      }),
      prisma.shipment.count({
        where: { deletedAt: null, batch: { departureDate: { gte: since } } },
      }),
      chinaComposition(),
      /* The age buckets carry a number and a unit ("8–14 days"), so they are
         built in the reader's language rather than translated afterwards — a
         flat dictionary cannot match a label that arrives already counted. */
      chinaAgeing(new Date(), locale),
      chinaFlowByDay(Math.min(periodDays, 14)),
      chinaProblems(),
    ]);

  const window = windowLabel(locale, periodDays);
  const zh = locale === "zh";
  const photographed = composition.total - problems.noPhotos;
  const photoPct =
    composition.total > 0
      ? Math.round((photographed / composition.total) * 100)
      : 100;

  const slices = [
    {
      label: t(locale, "On no batch"),
      value: composition.unassigned,
      tone: 3 as const,
    },
    {
      /* Not through the dictionary: it is keyed by English string and "Loading"
         is already spoken for by the page's own spinner ("加载中"). A batch
         taking cargo is 装货中, and labelling this slice "加载中" would tell a
         Guangzhou desk its consignments are still downloading. */
      label: zh ? "装货中" : "Loading",
      value: composition.loading,
      tone: 4 as const,
    },
    {
      label: t(locale, "Sealed, ready to fly"),
      value: composition.sealed,
      tone: 5 as const,
    },
  ];

  return (
    <>
      <PageHeader
        title={t(locale, "Guangzhou reports")}
        description={t(
          locale,
          "What this desk registered, what it loaded and what is still standing — measured from the registration and dispatch record itself."
        )}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {PERIODS.map((option) => (
              <Link
                key={option.days}
                href={`/app/reports?period=${option.days}`}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  option.days === periodDays
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(locale, option.label)}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t(locale, "Registered")}
          numeric={registered._count}
          hint={zh ? `近 ${window}登记入库` : `booked in over the ${window}`}
          icon={PackagePlus}
          tone="brand"
        />
        <KpiCard
          label={t(locale, "Flown")}
          numeric={flown}
          hint={zh ? `近 ${window}从广州发出` : `left Guangzhou over the ${window}`}
          icon={Plane}
          tone="success"
        />
        <KpiCard
          label={t(locale, "Still standing")}
          numeric={composition.total}
          hint={
            zh
              ? `本期登记 ${formatWeight(toNumber(registered._sum.weightKg ?? 0))}`
              : `${formatWeight(toNumber(registered._sum.weightKg ?? 0))} registered in this window`
          }
          icon={Boxes}
          tone={composition.total > 0 ? "warning" : "success"}
        />
        {/* The rule exists; this is whether it is kept. */}
        <KpiCard
          label={t(locale, "Photographed")}
          numeric={photoPct}
          suffix="%"
          ringPct={photoPct}
          ringLabel={t(locale, "Photograph compliance")}
          hint={
            problems.noPhotos > 0
              ? zh
                ? `在库 ${problems.noPhotos} 票没有照片`
                : `${problems.noPhotos} standing with no photograph`
              : t(locale, "every consignment has one")
          }
          icon={Camera}
          tone={photoPct < 90 ? "danger" : "success"}
        />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-4">
          <h3 className="text-sm font-semibold">
            {t(locale, "What is standing now")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "By what is holding each consignment")}
          </p>
          <div className="mt-3 flex justify-center">
            <Donut
              size={118}
              stroke={18}
              label={String(composition.total)}
              caption={t(locale, "consignments")}
              slices={slices}
            />
          </div>
          <DonutLegend className="mt-3" slices={slices} />
        </section>

        <section className="panel p-4">
          <h3 className="text-sm font-semibold">{t(locale, "In and out")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "Registered against flown, by day")}
          </p>
          <FlowBars
            className="mt-3"
            labels={throughput.labels}
            valuesIn={throughput.inCounts}
            valuesOut={throughput.outCounts}
            currentIndex={throughput.currentIndex}
            format={(n) =>
              zh ? `${n} 票货` : `${n} consignment${n === 1 ? "" : "s"}`
            }
            legendIn={t(locale, "Registered")}
            legendOut={t(locale, "Flown")}
          />
        </section>

        <section className="panel p-4">
          <h3 className="text-sm font-semibold">
            {t(locale, "How long it has waited")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "From the day it was registered")}
          </p>
          <AgeingBar
            className="mt-3"
            segments={ageing.map((bucket) => ({
              key: bucket.key,
              /* Already in the reader's language — see the `chinaAgeing` call. */
              label: bucket.label,
              count: bucket.count,
              value: bucket.packages,
            }))}
            format={(n) => (zh ? `${n} 箱` : `${n} box${n === 1 ? "" : "es"}`)}
            unit={{ one: t(locale, "consignment"), many: t(locale, "consignments") }}
            empty={t(locale, "Nothing is waiting in Guangzhou.")}
          />
        </section>
      </div>
    </>
  );
}
