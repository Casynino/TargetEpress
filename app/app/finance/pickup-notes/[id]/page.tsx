import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import {
  DocumentField,
  DocumentFooter,
  DocumentHeader,
  DocumentSheet,
  DocumentStamp,
} from "@/components/app/document-sheet";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
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

      <DocumentSheet>
        <DocumentHeader
          title="Pickup note"
          badge={
            note.status === "ACTIVE" ? null : (
              // A used or cancelled note has to be unmistakable at the counter,
              // where somebody is holding it out and a queue is forming.
              <DocumentStamp tone={note.status === "USED" ? "success" : "danger"}>
                {note.status === "USED" ? "Collected" : "Cancelled"}
              </DocumentStamp>
            )
          }
          meta={
            <>
              <p className="font-mono text-sm font-bold tabular text-[#182A48]">
                {note.noteNumber}
              </p>
              <p>Issued {formatDateTime(note.issuedAt)}</p>
            </>
          }
        />

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
            <DocumentField label="Customer">
              <p className="text-base font-bold">{note.customer.name}</p>
              <p className="font-mono text-sm tabular">
                {note.customer.phone ?? "Phone not recorded"}
              </p>
              <p className="font-mono text-xs tabular text-black/60">
                {note.customer.code}
              </p>
            </DocumentField>

            <DocumentField label="Shipment">
              <p className="font-mono text-lg font-bold tabular text-[#182A48]">
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
            </DocumentField>
          </div>
        </div>

        <section className="mt-6 rounded-lg bg-[#117447]/10 px-5 py-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/50">
            Payment confirmation
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-mono text-2xl font-bold tabular text-[#117447]">
              {formatMoney(note.amountPaid, note.currency)}
            </p>
            <p className="text-sm font-bold uppercase tracking-wide text-[#117447]">
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

        <div className="mt-8 grid grid-cols-2 gap-10 text-[11px]">
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">Received by (name &amp; signature)</p>
          </div>
          <div>
            <div className="h-10 border-b border-black/50" />
            <p className="mt-1.5 text-black/60">Released by (Target Express staff)</p>
          </div>
        </div>

        <DocumentFooter>
          <p>
            Issued by {note.issuedBy?.name ?? "Finance"} ·{" "}
            {formatDateTime(note.issuedAt)}
          </p>
        </DocumentFooter>
      </DocumentSheet>
    </div>
  );
}
