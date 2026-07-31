import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { COMPANY, ORIGIN_LABELS, formatPackages } from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Batch manifest" };

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
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      shipments: {
        orderBy: { trackingNumber: "asc" },
        include: {
          customer: { select: { name: true, phone: true } },
          createdBy: { select: { name: true } },
          cargoType: { select: { name: true } },
          _count: { select: { photos: true } },
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

  // Who took each piece in. A manifest that only totals the cargo answers "what
  // is on the flight"; a manager also needs "who handled it", because that is
  // who they ask when a carton is short.
  // What is actually in the batch, grouped by product. "Clothes 40 cartons,
  // Shoes 22 cartons" is the line a manager reads; eighty-five rows is not.
  const byProduct = [...
    batch.shipments
      .reduce((counts, shipment) => {
        const name =
          shipment.cargoType?.name ?? shipment.description.split(/[(,]/)[0].trim();
        const current = counts.get(name) ?? { pieces: 0, packages: 0, weightKg: 0 };
        counts.set(name, {
          pieces: current.pieces + 1,
          packages: current.packages + shipment.packages,
          weightKg: current.weightKg + toNumber(shipment.weightKg),
        });
        return counts;
      }, new Map<string, { pieces: number; packages: number; weightKg: number }>())
      .entries()
  ]
    .sort((a, b) => b[1].packages - a[1].packages)
    .slice(0, 12);

  const byReceiver = [...
    batch.shipments
      .reduce((counts, shipment) => {
        const name = shipment.createdBy?.name ?? "Not recorded";
        const current = counts.get(name) ?? { pieces: 0, weightKg: 0 };
        counts.set(name, {
          pieces: current.pieces + 1,
          weightKg: current.weightKg + toNumber(shipment.weightKg),
        });
        return counts;
      }, new Map<string, { pieces: number; weightKg: number }>())
      .entries()
  ].sort((a, b) => b[1].pieces - a[1].pieces);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print">
        <PageHeader
          title="Batch manifest"
          description="Print this and check the cargo against it, box by box."
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/app/batches/${batch.id}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Link>
              </Button>
              <PrintButton label="Print manifest" />
            </>
          }
        />
      </div>

      <article className="print-plain rounded-xl border bg-white p-8 text-black shadow-soft">
        <header className="flex items-start justify-between border-b-2 border-black/80 pb-5">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <p className="font-display text-xl font-bold leading-none">
                TARGET EXPRESS AIR CARGO
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em]">
                Batch manifest
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] leading-relaxed">
            <p>{COMPANY.phone}</p>
            <p>{COMPANY.email}</p>
            <p className="mt-1">Printed {formatDateTime(new Date())}</p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Batch number", value: batch.batchNumber },
            { label: "Origin", value: ORIGIN_LABELS[batch.origin] },
            {
              label: "Airline / flight",
              value: batch.airline
                ? `${batch.airline} ${batch.flightNumber ?? ""}`.trim()
                : "—",
            },
            {
              label: "Cargo category",
              value: CATEGORY_FOR_ROUTE[batch.origin] ?? "—",
            },
            { label: "Waybill", value: batch.waybillNumber ?? "—" },
            { label: "Departed", value: formatDate(batch.departureDate) },
            { label: "Arrived", value: formatDate(batch.arrivalDate) },
            { label: "Shipments", value: String(batch.shipments.length) },
            {
              label: "Total packages / weight",
              value: `${totalPackages} / ${formatWeight(totalWeight)}`,
            },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                {item.label}
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold tabular">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {byProduct.length > 0 ? (
          <section className="mt-6 border-t border-black/20 pt-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-black/60">
              What is inside
            </p>
            <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {byProduct.map(([name, stats]) => (
                <li key={name} className="flex justify-between gap-3 text-[11px]">
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 font-mono tabular">
                    {stats.packages} · {stats.weightKg.toFixed(1)} kg
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {byReceiver.length > 0 ? (
          <section className="mt-6 border-y border-black/20 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-black/60">
              Received by
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
              {byReceiver.map(([name, stats]) => (
                <li key={name} className="text-[11px]">
                  <span className="font-semibold">{name}</span>{" "}
                  <span className="font-mono tabular">
                    {stats.pieces} piece{stats.pieces === 1 ? "" : "s"} ·{" "}
                    {stats.weightKg.toFixed(1)} kg
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <table className="mt-7 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y-2 border-black/70 text-left">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Carton</th>
              <th className="py-2 pr-2 font-semibold">Tracking</th>
              <th className="py-2 pr-2 font-semibold">Customer</th>
              <th className="py-2 pr-2 font-semibold">Phone</th>
              <th className="py-2 pr-2 font-semibold">Product</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Weight</th>
              <th className="py-2 pr-2 font-semibold">Received</th>
              <th className="py-2 pr-2 font-semibold">By</th>
              <th className="w-10 py-2 text-center font-semibold">Photo</th>
              {/* Physically ticked with a pen while checking the cargo. */}
              <th className="w-16 py-2 text-center font-semibold">Checked</th>
            </tr>
          </thead>
          <tbody>
            {batch.shipments.map((shipment, index) => (
              <tr key={shipment.id} className="border-b border-black/15">
                <td className="py-2 pr-2 tabular">{index + 1}</td>
                <td className="py-2 pr-2 font-mono tabular">
                  {shipment.cartonRef ?? "—"}
                </td>
                <td className="py-2 pr-2 font-mono font-semibold tabular">
                  {shipment.trackingNumber}
                </td>
                <td className="py-2 pr-2">{shipment.customer.name}</td>
                <td className="py-2 pr-2 font-mono tabular">
                  {shipment.customer.phone ?? "—"}
                </td>
                <td className="py-2 pr-2">
                  {shipment.cargoType?.name ?? shipment.description}
                </td>
                <td className="py-2 pr-2 text-right tabular">
                  {formatPackages(shipment.packages, shipment.packageType)}
                </td>
                <td className="py-2 pr-2 text-right tabular">
                  {formatWeight(shipment.weightKg)}
                </td>
                <td className="py-2 pr-2 tabular">
                  {formatDate(shipment.registeredAt)}
                </td>
                <td className="py-2 pr-2">{shipment.createdBy?.name ?? "—"}</td>
                <td className="py-2 text-center">
                  {shipment._count.photos > 0 ? (
                    <span className="font-semibold">{shipment._count.photos}</span>
                  ) : (
                    <span className="text-black/40">—</span>
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
                Total
              </td>
              <td className="py-2 pr-2 text-right tabular">{totalPackages}</td>
              <td className="py-2 pr-2 text-right tabular">
                {formatWeight(totalWeight)}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-10 text-[11px]">
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">Checked by (name &amp; signature)</p>
          </div>
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">Date &amp; time</p>
          </div>
        </div>
      </article>
    </div>
  );
}
