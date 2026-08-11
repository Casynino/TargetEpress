import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { PickupSlip, type PickupSlipData } from "@/components/app/pickup-slip";
import { PrintBar } from "@/components/app/print-bar";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { SLIP_MM } from "@/lib/print";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Pickup note" };

export default async function PickupNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Support prints the note Finance issued. Issuing one is pickupNote.issue
  // and is checked in the action, not here.
  const user = await requirePermission("pickupNote.view");
  const locale = await viewerLocale();
  const { id } = await params;

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
          ...selectText("description"),
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
    issuedOn: formatDate(note.issuedAt, locale),
    trackingNumber: note.shipment.trackingNumber,
    customerName: note.customer.name,
    customerPhone: note.customer.phone,
    description: cargoText(locale, note.shipment, "description"),
    weightLabel: formatWeight(note.shipment.weightKg),
    packagesLabel: formatPackages(
      note.shipment.packages,
      note.shipment.packageType
    ),
    invoiceNumber: note.shipment.invoice?.invoiceNumber ?? null,
    paymentStatus: t(locale, "Paid in full"),
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
            {t(locale, "All pickup notes")}
          </Link>
        </Button>
      </div>

      <PrintBar
        item={SLIP_MM}
        printLabel={t(locale, "Print pickup note")}
        downloadHref={`/app/finance/pickup-notes/${id}/pdf`}
        hint={t(locale, "Print it for the customer, or send them the file.")}
      />

      <div className="flex justify-center">
        <PickupSlip data={data} />
      </div>

    </div>
  );
}
