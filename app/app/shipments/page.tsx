import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  ShipmentsDashboard,
  type DispatchRow,
} from "@/components/app/shipments-dashboard";
import { EXCEPTION_OPEN_STATUSES, ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Batches" };

/**
 * The dispatch archive, as a dashboard.
 *
 * One row per flight-load that has left China, with the numbers that answer
 * "what is in the air and what is waiting on me" before any row is opened.
 * Batches hold what is still in China; everything here has gone.
 */
/**
 * What one dispatch is worth and how much has come in.
 *
 * The same three rules as the Financial overview on the dispatch itself, so a
 * flight cannot say one thing on the board and another when you open it:
 * a DRAFT counts towards what is expected but is never a debt, because nobody
 * has been asked for it; a VOID counts towards nothing; and outstanding is
 * only ever billed-and-unpaid.
 *
 * Cargo with no invoice at all is simply absent from these figures rather than
 * estimated. The board is a glance across many flights and an estimate here
 * would need the rate book queried once per consignment on every row.
 */
function moneyFor(
  cargo: {
    invoice: {
      total: unknown;
      amountPaid: unknown;
      status: string;
    } | null;
  }[]
) {
  let expected = 0;
  let collected = 0;
  let outstanding = 0;
  let drafts = 0;

  for (const piece of cargo) {
    const invoice = piece.invoice;
    if (!invoice || invoice.status === "VOID") continue;

    const total = toNumber(invoice.total as never);
    const paid = toNumber(invoice.amountPaid as never);

    expected += total;
    collected += paid;
    if (invoice.status === "DRAFT") drafts += 1;
    else outstanding += Math.max(0, total - paid);
  }

  return { currency: "USD", expected, collected, outstanding, drafts };
}

export default async function ShipmentsPage() {
  const user = await requirePermission("batch.view");
  const locale = await viewerLocale();
  const showMoney = can(user.role, "finance.view");

  const dispatches = await prisma.batch.findMany({
    where: { permanent: false },
    orderBy: [{ departedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      origin: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      departureDate: true,
      expectedArrival: true,
      arrivalDate: true,
      createdAt: true,
      shipments: {
        select: {
          weightKg: true,
          packages: true,
          customerId: true,
          cargoCategory: true,
          cargoTypeId: true,
          arrivedAt: true,
          deliveredAt: true,
          // Unfinished cases only. A resolved shortage is history; an open one
          // is cargo somebody is still looking for.
          exceptions: {
            where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
            select: { id: true },
          },
          // Only selected for desks that may see money. A figure never
          // fetched cannot leak through a serialised prop.
          ...(showMoney
            ? {
                invoice: {
                  select: {
                    total: true,
                    amountPaid: true,
                    status: true,
                  },
                },
              }
            : {}),
        },
      },
    },
  });

  /*
    What clearing each flight has cost, in one query rather than one per row.

    Not a groupBy: a cost paid in shillings counts at face value and a cost
    paid in dollars is converted, which is a per-row decision a SUM cannot
    make. Same rule as lib/batch-finance, so a flight's Expenses figure is the
    same number on this board as on its own page — and OPERATING only, again
    matching batch profit, because a special cost is real money deliberately
    kept out of the figure the business is judged on.
  */
  const rate = showMoney ? await currentRateValue() : null;
  const costs = showMoney
    ? await prisma.expense.findMany({
        where: {
          batchId: { in: dispatches.map((d) => d.id) },
          status: { not: "VOID" },
          expenseClass: "OPERATING",
        },
        select: { batchId: true, amount: true, currency: true, amountUsd: true },
      })
    : [];

  const spend = new Map<string, { usd: number; tzs: number }>();
  for (const cost of costs) {
    if (!cost.batchId) continue;
    const usd = toNumber(cost.amountUsd);
    const entry = spend.get(cost.batchId) ?? { usd: 0, tzs: 0 };
    entry.usd += usd;
    entry.tzs +=
      cost.currency === "TZS" ? toNumber(cost.amount) : rate ? usd * rate : 0;
    spend.set(cost.batchId, entry);
  }

  const rows: DispatchRow[] = dispatches.map((dispatch) => ({
    id: dispatch.id,
    shipmentNumber: dispatch.batchNumber,
    route: ORIGIN_LABELS[dispatch.origin],
    status: dispatch.status,
    cargoCount: dispatch.shipments.length,
    customerCount: new Set(dispatch.shipments.map((c) => c.customerId)).size,
    weightKg: dispatch.shipments.reduce((sum, c) => sum + toNumber(c.weightKg), 0),
    packages: dispatch.shipments.reduce((sum, c) => sum + c.packages, 0),
    waybillNumber: dispatch.waybillNumber,
    airline: dispatch.airline,
    flightNumber: dispatch.flightNumber,
    departedLabel: dispatch.departureDate ? formatDate(dispatch.departureDate, locale) : null,
    expectedLabel: dispatch.expectedArrival
      ? formatDate(dispatch.expectedArrival, locale)
      : null,
    arrivedLabel: dispatch.arrivalDate ? formatDate(dispatch.arrivalDate, locale) : null,
    /* Landed where it landed, left where it has not. Decided here so every
       desk agrees on which month a flight is in, whatever a browser thinks. */
    month: (dispatch.arrivalDate ?? dispatch.departureDate ?? dispatch.createdAt)
      .toISOString()
      .slice(0, 7),
    flagged: dispatch.shipments.filter((c) => c.exceptions.length > 0).length,
    money: showMoney
      ? {
          ...moneyFor(dispatch.shipments),
          spentUsd: spend.get(dispatch.id)?.usd ?? 0,
          spentTzs: spend.get(dispatch.id)?.tzs ?? 0,
        }
      : null,
  }));

  /*
    The months that actually flew, newest first.

    Built from the rows rather than from a calendar, so the chips can only ever
    offer a month with something in it. Labelled on the server because the
    label has to match the reader's language, and that is decided here.
  */
  const months = [...new Set(rows.map((row) => row.month))]
    .sort()
    .reverse()
    .map((key) => ({
      key,
      label: new Date(`${key}-02`).toLocaleDateString(
        locale === "zh" ? "zh-CN" : "en-GB",
        { month: "short", year: "numeric" }
      ),
    }));

  return (
    <>
      <PageHeader
        title="Batches"
        description="Every dispatch that has left China. Open one to see its cargo, documents and full timeline."
      />

      <ShipmentsDashboard rows={rows} months={months} rate={rate} />

      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <PackageCheck className="h-4 w-4" />
        {t(locale, "Cargo still waiting in China is on the")}{" "}
        <Link href="/app/batches" className="font-medium text-brand hover:underline">
          {t(locale, "two loading tables")}
        </Link>
        .
      </p>
    </>
  );
}
