import { NextResponse } from "next/server";

import { pdfHeaders } from "@/lib/card-pdf";
import { CATEGORY_LABELS, cargoLabel } from "@/lib/cargo";
import { EXCEPTION_TYPE_LABELS, formatPackagesShort } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { latinLabel, manifestFileName, manifestToPdf } from "@/lib/manifest-pdf";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cargoText } from "@/lib/viewer";

/**
 * The batch manifest as a file.
 *
 * Same document and same gate as the manifest page — the desk that may look at
 * a flight may keep a copy of it. What is deliberately NOT here is the money:
 * the page prints the clearing fee and the margin only to expense.view, and a
 * file walks further than a screen does, so this carries the cargo and nothing
 * else. Anyone who needs the figures has the page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("batch.view");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      shipments: {
        where: { deletedAt: null },
        orderBy: { registeredAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          createdBy: { select: { name: true } },
          cargoType: { select: { name: true } },
          packageList: { select: { receivedAt: true } },
          exceptions: {
            where: { resolvedAt: null },
            select: { type: true },
            orderBy: { raisedAt: "asc" },
          },
        },
      },
    },
  });

  if (!batch) {
    return new NextResponse("Not found", { status: 404 });
  }

  /*
    English throughout, whatever the reader was viewing in.

    The PDF's fonts are WinAnsi and drop anything outside them, so a cargo type
    the Guangzhou desk typed in Chinese would come out as an empty cell rather
    than as Chinese — and this sheet is checked in Dar and filed with a
    Tanzanian clearing agent. Every translated field has an English side; this
    asks for it by name.
  */
  const EN = "en" as const;

  const totalWeight = batch.shipments.reduce(
    (sum, s) => sum + toNumber(s.weightKg),
    0
  );
  const totalPackages = batch.shipments.reduce((sum, s) => sum + s.packages, 0);
  const totalArrived = batch.shipments.reduce(
    (sum, s) => sum + s.packageList.filter((pkg) => pkg.receivedAt).length,
    0
  );

  const pdf = manifestToPdf({
    batchNumber: batch.batchNumber,
    /* Route and cargo class in one line rather than a seventh fact chip: the
       header strip is already six wide, and what a flight carries belongs
       beside where it came from. */
    route:
      `${batch.origin === "HONG_KONG" ? "Hong Kong" : "Guangzhou"} - Dar es Salaam` +
      ` - ${batch.origin === "HONG_KONG" ? "Electronics & special goods" : "Normal goods"}`,
    waybill: batch.waybillNumber ?? "—",
    departed: batch.departureDate ? formatDate(batch.departureDate, EN) : "—",
    arrived: batch.arrivedAt ? formatDate(batch.arrivedAt, EN) : "—",
    consignments: batch.shipments.length,
    totalPackages: `${totalPackages} pcs`,
    totalWeight: formatWeight(totalWeight),
    totalArrived: `${totalArrived} of ${totalPackages} pcs`,
    rows: batch.shipments.map((shipment) => {
      const here = shipment.packageList.filter((pkg) => pkg.receivedAt).length;
      const short = here < shipment.packages;
      return {
        received: formatDate(shipment.registeredAt, EN),
        tracking: shipment.trackingNumber,
        customer: shipment.customer.name,
        phone: shipment.customer.phone ?? "—",
        /* The English side first, then whatever survives the PDF's fonts, then
           the cargo class. Guangzhou creates its own cargo types and names them
           in Chinese, which the page shows happily and the file cannot — so
           without the last step a 479 kg line reaches customs with no goods
           against it at all. */
        item: latinLabel(
          cargoLabel(
            shipment.cargoType ? t(EN, shipment.cargoType.name) : null,
            cargoText(EN, shipment, "description"),
            EN
          ),
          t(EN, CATEGORY_LABELS[shipment.cargoCategory])
        ),
        /* A short consignment reads as short on the file too. "0 of 84 pcs" is
           the whole reason somebody prints this and walks the floor. */
        countedAs: short
          ? `${here} of ${formatPackagesShort(shipment.packages, shipment.packageType, EN)}`
          : formatPackagesShort(shipment.packages, shipment.packageType, EN),
        weight: formatWeight(shipment.weightKg),
        receivedBy: shipment.createdBy?.name ?? "—",
        problem:
          shipment.exceptions.length > 0
            ? shipment.exceptions
                .map((e) => t(EN, EXCEPTION_TYPE_LABELS[e.type] ?? e.type))
                .join(", ")
            : "—",
      };
    }),
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: pdfHeaders(manifestFileName(batch.batchNumber)),
  });
}
