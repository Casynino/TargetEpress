import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { PickupSlip, type PickupSlipData } from "@/components/app/pickup-slip";
import { PrintFormatBar } from "@/components/app/print-format";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { printFormatFrom, SLIP_MM } from "@/lib/print";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Pickup note" };

export default async function PickupNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  // Support prints the note Finance issued. Issuing one is pickupNote.issue
  // and is checked in the action, not here.
  const user = await requirePermission("pickupNote.view");
  const { id } = await params;
  const { format: rawFormat } = await searchParams;
  const format = printFormatFrom(rawFormat);

  const note = await prisma.pickupNote.findUnique({
    where: { id },
    select: {
      noteNumber: true,
      status: true,
      issuedAt: true,
      amountPaid: true,
      currency: true,
      customer: { select: { name: true, phone: true } },
      shipment: {
        select: {
          trackingNumber: true,
          qrToken: true,
          description: true,
          packages: true,
          packageType: true,
          weightKg: true,
          invoice: { select: { invoiceNumber: true } },
        },
      },
    },
  });

  if (!note) notFound();

  // The note carries the SHIPMENT's QR — the same code the warehouse will scan
  // on the carton. One identity, both documents.
  //
  // 640px into a 54mm square is ~301dpi — a 45-module code (data plus quiet
  // zone) lands at 1.2mm per module, which a phone locks onto instantly.
  const qr = await shipmentQrDataUrl(note.shipment.qrToken, 640);

  const data: PickupSlipData = {
    noteNumber: note.noteNumber,
    status: note.status,
    issuedOn: formatDate(note.issuedAt),
    trackingNumber: note.shipment.trackingNumber,
    customerName: note.customer.name,
    customerPhone: note.customer.phone,
    description: note.shipment.description,
    weightLabel: formatWeight(note.shipment.weightKg),
    packagesLabel: formatPackages(
      note.shipment.packages,
      note.shipment.packageType
    ),
    invoiceNumber: note.shipment.invoice?.invoiceNumber ?? null,
    paymentStatus: "Paid in full",
    /*
      The figure only for the desks allowed one.

      A slip goes to the customer, who is entitled to see what they paid — but
      it is printed and reprinted from a staff screen, and the warehouse rule
      is that its people read the payment FACT and never the amount. "Paid in
      full" is the sentence that matters at the counter either way.
    */
    amountLabel: can(user.role, "finance.view")
      ? formatMoney(note.amountPaid, note.currency)
      : null,
    qr,
  };

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="no-print">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/finance/pickup-notes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All pickup notes
          </Link>
        </Button>
      </div>

      <PrintFormatBar
        format={format}
        item={SLIP_MM}
        count={1}
        noun="pickup note"
        printLabel="Print pickup note"
        hint="Hand it to the customer — they bring it back to collect."
      />

      <div className="flex justify-center">
        <PickupSlip data={data} />
      </div>

      <p className="no-print mt-4 text-center text-xs text-muted-foreground">
        Print at 100% scale. {SLIP_MM.width}×{SLIP_MM.height}mm — a receipt, not
        a document, so it survives a pocket and a walk across Kariakoo.
      </p>
    </div>
  );
}
