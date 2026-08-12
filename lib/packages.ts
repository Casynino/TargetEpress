import "server-only";

import { prisma } from "@/lib/prisma";
import { parseQrPayload } from "@/lib/qr";
import { formatPackages } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

/**
 * Packages: the physical half of a shipment.
 *
 * A shipment is the customer's order. A package is a box someone can pick up,
 * and it is the unit the warehouse actually works in — you receive boxes, you
 * lose boxes, you hand boxes over. Everything here is about answering "which
 * box is this, and where are its brothers".
 */

export type ScanTarget = {
  shipmentId: string;
  /** Set when a package label was scanned rather than an order-level one. */
  package: {
    id: string;
    sequence: number;
    reference: string;
    receivedAt: Date | null;
    deliveredAt: Date | null;
  } | null;
};

/**
 * Turns whatever came out of the scanner into a shipment, and — when the label
 * was on a box — the specific box.
 *
 * Old labels carry a shipment token and new ones carry a package token, and a
 * warehouse will have both stuck to cargo for months. Rather than make the
 * scanner operator care, an unrecognised token is looked for in both tables.
 */
export async function resolveScannedCode(raw: string): Promise<ScanTarget | null> {
  const code = parseQrPayload(raw);
  if (!code) return null;

  const PACKAGE_FIELDS = {
    id: true,
    sequence: true,
    reference: true,
    receivedAt: true,
    deliveredAt: true,
    shipmentId: true,
    shipment: { select: { deletedAt: true } },
  } as const;

  if (code.kind === "package") {
    const pkg = await prisma.package.findUnique({
      where: { qrToken: code.token },
      select: PACKAGE_FIELDS,
    });
    if (!pkg || pkg.shipment.deletedAt) return null;
    return { shipmentId: pkg.shipmentId, package: stripShipment(pkg) };
  }

  const shipment = await prisma.shipment.findUnique({
    where: { qrToken: code.token },
    select: { id: true },
  });
  if (shipment) return { shipmentId: shipment.id, package: null };

  // A bare token of unknown origin. Try the package table before giving up.
  const pkg = await prisma.package.findUnique({
    where: { qrToken: code.token },
    select: PACKAGE_FIELDS,
  });
  if (!pkg || pkg.shipment.deletedAt) return null;
  return { shipmentId: pkg.shipmentId, package: stripShipment(pkg) };
}

function stripShipment(pkg: {
  id: string;
  sequence: number;
  reference: string;
  receivedAt: Date | null;
  deliveredAt: Date | null;
}) {
  return {
    id: pkg.id,
    sequence: pkg.sequence,
    reference: pkg.reference,
    receivedAt: pkg.receivedAt,
    deliveredAt: pkg.deliveredAt,
  };
}

export type PackageProgress = {
  total: number;
  received: number;
  delivered: number;
  /** Sequence numbers not yet checked in — what to shout about on the floor. */
  missing: number[];
  complete: boolean;
  /** "4 of 5 packages received" */
  label: string;
};

/**
 * How much of a shipment is physically accounted for.
 *
 * The count that matters at the Dar counter is not "is this shipment received"
 * but "are all five boxes here". A shipment with four of five is short, and
 * delivery has to refuse it.
 */
export function packageProgress(
  packages: { sequence: number; receivedAt: Date | null; deliveredAt: Date | null }[],
  packageType: string,
  locale: Locale = "en"
): PackageProgress {
  const total = packages.length;
  const received = packages.filter((p) => p.receivedAt).length;
  const delivered = packages.filter((p) => p.deliveredAt).length;
  const missing = packages
    .filter((p) => !p.receivedAt)
    .map((p) => p.sequence)
    .sort((a, b) => a - b);

  return {
    total,
    received,
    delivered,
    missing,
    complete: total > 0 && missing.length === 0,
    // The counts stay outside the dictionary and the unit goes through it, so
    // "4/5 cartons received" and "4/5 纸箱 已核收" are the same sentence.
    label: `${received}/${formatPackages(total, packageType, locale)} ${t(locale, "received")}`,
  };
}
