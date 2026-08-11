import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import {
  DocumentFooter,
  DocumentHeader,
  DocumentSheet,
} from "@/components/app/document-sheet";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import {
  EXCEPTION_TYPE_LABELS,
  ORIGIN_LABELS,
  formatPackagesShort,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { cargoLabel } from "@/lib/cargo";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Batch manifest") };
}

/** What each batch carries, stated once at the top of the document. */
const CATEGORY_FOR_ROUTE: Record<string, string> = {
  GUANGZHOU: "Normal goods",
  HONG_KONG: "Electronics & special goods",
};

export default async function ManifestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      shipments: {
        orderBy: { registeredAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          createdBy: { select: { name: true } },
          cargoType: { select: { name: true } },
          // What actually came off the plane, and anything raised against this
          // line. A manifest that only ever prints the declared count cannot
          // show a shortage, which is the one thing a checked manifest is for.
          packageList: { select: { receivedAt: true } },
          exceptions: {
            where: { resolvedAt: null },
            select: { type: true, description: true },
            orderBy: { raisedAt: "asc" },
          },
        },
      },
    },
  });

  if (!batch) notFound();

  const totalWeight = batch.shipments.reduce(
    (sum, s) => sum + toNumber(s.weightKg),
    0
  );
  const totalPackages = batch.shipments.reduce((sum, s) => sum + s.packages, 0);
  // Counted from Package.receivedAt, so the total falls when boxes are short.
  const totalArrived = batch.shipments.reduce(
    (sum, s) => sum + s.packageList.filter((pkg) => pkg.receivedAt).length,
    0
  );
  const flagged = batch.shipments.filter((s) => s.exceptions.length > 0);

  // Broken down by unit, because "148" on a manifest is not a checkable number:
  // customs and the warehouse both need to know 96 ctn and 52 bag. Short forms
  // throughout — everyone on the floor reads them, and the page has to fit.
  const byUnit = new Map<string, number>();
  for (const shipment of batch.shipments) {
    byUnit.set(
      shipment.packageType,
      (byUnit.get(shipment.packageType) ?? 0) + shipment.packages
    );
  }
  const unitBreakdown = [...byUnit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => formatPackagesShort(count, type))
    .join(" · ");

  // Who took each piece in. A manifest that only totals the cargo answers "what
  // is on the flight"; a manager also needs "who handled it", because that is
  // who they ask when a carton is short.
  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print">
        <PageHeader
          title={t(locale, "Batch manifest")}
          description={t(
            locale,
            "Print this and check the cargo against it, line by line."
          )}
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/app/batches/${batch.id}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t(locale, "Back")}
                </Link>
              </Button>
              <PrintButton label={t(locale, "Print manifest")} />
            </>
          }
        />
      </div>

      <DocumentSheet>
        <DocumentHeader
          title={t(locale, "Batch manifest")}
          meta={
            <>
              <p className="font-mono text-sm font-bold tabular text-[#182A48]">
                {batch.batchNumber}
              </p>
              <p>
                {t(locale, ORIGIN_LABELS[batch.origin])} —{" "}
                {t(locale, "Dar es Salaam")}
              </p>
              <p>
                {t(locale, "Printed")} {formatDateTime(new Date(), locale)}
              </p>
            </>
          }
        />

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Batch number", value: batch.batchNumber },
            { label: "Origin", value: t(locale, ORIGIN_LABELS[batch.origin]) },
            {
              label: "Airline / flight",
              value: batch.airline
                ? `${batch.airline} ${batch.flightNumber ?? ""}`.trim()
                : "—",
            },
            {
              label: "Cargo category",
              value: CATEGORY_FOR_ROUTE[batch.origin]
                ? t(locale, CATEGORY_FOR_ROUTE[batch.origin])
                : "—",
            },
            { label: "Waybill", value: batch.waybillNumber ?? "—" },
            { label: "Departed", value: formatDate(batch.departureDate, locale) },
            { label: "Arrived", value: formatDate(batch.arrivalDate, locale) },
            { label: "Shipments", value: String(batch.shipments.length) },
            { label: "Total packages", value: unitBreakdown || "—" },
            { label: "Total weight", value: formatWeight(totalWeight) },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                {t(locale, item.label)}
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold tabular">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <table className="mt-7 w-full border-collapse text-[11px]">
          <thead>
            {/* The same navy band the invoice puts over its charges. Two
                documents from two desks should look like they came from one
                company. */}
            <tr className="bg-[#182A48] text-left text-[10px] uppercase tracking-[0.08em] text-white">
              <th className="rounded-l-md py-2 pl-2.5 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">{t(locale, "Received")}</th>
              <th className="py-2 pr-2 font-semibold">{t(locale, "Tracking")}</th>
              <th className="py-2 pr-2 font-semibold">{t(locale, "Customer")}</th>
              <th className="py-2 pr-2 font-semibold">{t(locale, "Phone")}</th>
              <th className="py-2 pr-2 font-semibold">{t(locale, "Which item?")}</th>
              <th className="whitespace-nowrap py-2 pr-2 text-right font-semibold">
                {t(locale, "Counted as")}
              </th>
              <th className="py-2 pr-2 text-right font-semibold">
                {t(locale, "Weight")}
              </th>
              <th className="whitespace-nowrap py-2 pr-2 font-semibold">
                {t(locale, "Received by")}
              </th>
              {/* Physically ticked with a pen while checking the cargo. The
                  count is already in "Counted as" — one box per package only
                  repeated it. */}
              <th className="py-2 pr-2 font-semibold">{t(locale, "Problem")}</th>
              <th className="w-16 rounded-r-md py-2 pr-2 text-center font-semibold">
                {t(locale, "Checked")}
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.shipments.map((shipment, index) => (
              <tr key={shipment.id} className="border-b border-black/15">
                <td className="py-2 pr-2 tabular">{index + 1}</td>
                <td className="whitespace-nowrap py-2 pr-2 tabular">
                  {formatDate(shipment.registeredAt, locale)}
                </td>
                <td className="py-2 pr-2 font-mono font-semibold tabular">
                  {shipment.trackingNumber}
                </td>
                <td className="py-2 pr-2">{shipment.customer.name}</td>
                <td className="py-2 pr-2 font-mono tabular">
                  {shipment.customer.phone ?? "—"}
                </td>
                <td className="py-2 pr-2">
                  {cargoLabel(
                    shipment.cargoType
                      ? t(locale, shipment.cargoType.name)
                      : null,
                    cargoText(locale, shipment, "description")
                  )}
                </td>
                <td className="py-2 pr-2 text-right tabular">
                  {(() => {
                    const here = shipment.packageList.filter(
                      (pkg) => pkg.receivedAt
                    ).length;
                    const short = here < shipment.packages;
                    return short ? (
                      <span className="font-semibold">
                        {here} {t(locale, "of")}{" "}
                        {formatPackagesShort(
                          shipment.packages,
                          shipment.packageType
                        )}
                      </span>
                    ) : (
                      formatPackagesShort(shipment.packages, shipment.packageType)
                    );
                  })()}
                </td>
                <td className="py-2 pr-2 text-right tabular">
                  {formatWeight(shipment.weightKg)}
                </td>
                <td className="py-2 pr-2">{shipment.createdBy?.name ?? "—"}</td>
                <td className="py-2 pr-2">
                  {shipment.exceptions.length > 0 ? (
                    <span className="font-semibold">
                      {shipment.exceptions
                        .map((e) =>
                          t(locale, EXCEPTION_TYPE_LABELS[e.type] ?? e.type)
                        )
                        .join(", ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-center">
                  <span className="inline-block h-3.5 w-3.5 border border-black/60" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/70 font-semibold">
              <td className="py-2" colSpan={6}>
                {t(locale, "Total")}
              </td>
              <td className="py-2 pr-2 text-right tabular">{totalPackages}</td>
              <td className="py-2 pr-2 text-right tabular">
                {formatWeight(totalWeight)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-10 text-[11px]">
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">
              {t(locale, "Checked by (name & signature)")}
            </p>
          </div>
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">{t(locale, "Date & time")}</p>
          </div>
        </div>

        <DocumentFooter />
      </DocumentSheet>
    </div>
  );
}
