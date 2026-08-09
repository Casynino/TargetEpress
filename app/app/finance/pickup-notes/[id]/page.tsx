import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand-mark";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { COMPANY, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Pickup note" };

export default async function PickupNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Support prints the note Finance issued. Issuing one is pickupNote.issue
  // and is checked in the action, not here.
  await requirePermission("pickupNote.view");
  const { id } = await params;

  const note = await prisma.pickupNote.findUnique({
    where: { id },
    include: {
      customer: true,
      issuedBy: { select: { name: true } },
      shipment: {
        include: {
          batch: { select: { batchNumber: true } },
          invoice: {
            include: {
              payments: {
                orderBy: { paidAt: "desc" },
                include: { receipt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!note) notFound();

  // The note carries the SHIPMENT's QR — the same code the warehouse will scan
  // on the carton. One identity, both documents.
  const qr = await shipmentQrDataUrl(note.shipment.qrToken, 300);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/finance/pickup-notes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All pickup notes
          </Link>
        </Button>
        <PrintButton label="Print pickup note" />
      </div>

      <article className="print-plain rounded-xl border-2 bg-white p-8 text-black shadow-soft">
        <header className="flex items-start justify-between border-b-2 border-black/80 pb-5">
          {/* The registered lockup, in its own colours. This page prints on
              white and leaves the building, so it carries the artwork rather
              than the mark plus the name set in our own type. */}
          <div>
            <BrandLogo className="h-14 w-auto" />
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em]">
              Pickup note
            </p>
          </div>
          <div className="text-right text-[11px] leading-relaxed">
            <p className="font-mono text-sm font-bold tabular">
              {note.noteNumber}
            </p>
            <p>{COMPANY.phone}</p>
            <p>{COMPANY.darAddress}</p>
          </div>
        </header>

        {note.status !== "ACTIVE" ? (
          <p className="mt-4 rounded border-2 border-black/70 px-3 py-2 text-center text-sm font-bold uppercase tracking-widest">
            {note.status === "USED" ? "Collected" : "Cancelled"}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-8">
          <Image
            src={qr}
            alt={`QR for ${note.shipment.trackingNumber}`}
            width={160}
            height={160}
            className="shrink-0 border border-black/20"
            unoptimized
          />

          <div className="min-w-[240px] flex-1 space-y-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                Customer
              </p>
              <p className="text-base font-bold">{note.customer.name}</p>
              <p className="font-mono text-sm tabular">
                {note.customer.phone ?? "Phone not recorded"}
              </p>
              <p className="font-mono text-xs tabular text-black/60">
                {note.customer.code}
              </p>
            </div>

            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                Shipment
              </p>
              <p className="font-mono text-lg font-bold tabular">
                {note.shipment.trackingNumber}
              </p>
              <p className="text-sm">
                {note.shipment.packages} package(s) ·{" "}
                {formatWeight(note.shipment.weightKg)}
                {note.shipment.batch
                  ? ` · ${note.shipment.batch.batchNumber}`
                  : ""}
              </p>
              <p className="text-sm">{note.shipment.description}</p>
            </div>
          </div>
        </div>

        <section className="mt-6 border-y border-black/20 py-5">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
            Payment confirmation
          </p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-mono text-2xl font-bold tabular">
              {formatMoney(note.amountPaid, note.currency)}
            </p>
            <p className="text-sm font-semibold uppercase tracking-wide">
              Paid in full
            </p>
          </div>
          {note.shipment.invoice ? (
            <ul className="mt-3 space-y-1 text-[11px]">
              {note.shipment.invoice.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-4">
                  <span>
                    {payment.receipt?.receiptNumber} ·{" "}
                    {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                  <span className="font-mono tabular">
                    {formatMoney(payment.amount, payment.currency)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-black/20 pt-1 font-semibold">
                <span>Invoice {note.shipment.invoice.invoiceNumber}</span>
                <span className="font-mono tabular">
                  {formatMoney(
                    note.shipment.invoice.total,
                    note.shipment.invoice.currency
                  )}
                </span>
              </li>
            </ul>
          ) : null}
        </section>

        <p className="mt-5 text-[11px] leading-relaxed text-black/75">
          Present this note at the Target Express warehouse in Dar es Salaam to
          collect the cargo above. Our staff will scan this code and the code on
          the cargo — both must match before release. This note may be used
          once. Anyone collecting on the customer&apos;s behalf must present it
          together with their own ID.
        </p>

        <footer className="mt-8 grid grid-cols-2 gap-10 text-[11px]">
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">Received by (name &amp; signature)</p>
          </div>
          <div>
            <p className="font-semibold">
              Issued by {note.issuedBy?.name ?? "Finance"}
            </p>
            <p className="text-black/60">{formatDateTime(note.issuedAt)}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
