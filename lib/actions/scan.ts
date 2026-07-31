"use server";

import { SHIPMENT_STATUS_META } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { packageProgress, resolveScannedCode } from "@/lib/packages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";
import { fail, ok, type ActionResult } from "@/lib/actions/types";

/**
 * One QR code, four answers.
 *
 * The same token resolves differently depending on who is holding the scanner
 * and where the cargo is in its life: China sees what was registered, Finance
 * sees the money, the Dar warehouse sees whether it may hand the box over.
 */
export type ScanResult = {
  shipmentId: string;
  trackingNumber: string;
  status: string;
  statusLabel: string;
  customerName: string;
  customerPhone: string | null;
  packages: number;
  weightKg: number;
  /** Which box was scanned, when the label came off a package. */
  scannedPackage: { sequence: number; reference: string; received: boolean } | null;
  /** How many of the shipment's packages are physically accounted for. */
  progress: { total: number; received: number; missing: number[]; label: string };
  description: string;
  batchNumber: string | null;
  /** The single most important sentence for this user, right now. */
  verdict: { tone: "ok" | "warn" | "block"; headline: string; detail: string };
  finance: {
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    outstanding: number;
    currency: string;
    status: string;
  } | null;
  pickupNote: { noteNumber: string; status: string } | null;
  canRelease: boolean;
};

export async function resolveScan(
  rawCode: string
): Promise<ActionResult<ScanResult>> {
  const user = await currentUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const target = await resolveScannedCode(rawCode);
  if (!target) return fail("That is not a Target Express label.");

  const shipment = await prisma.shipment.findUnique({
    where: { id: target.shipmentId },
    select: {
      id: true,
      packageType: true,
      packageList: {
        select: { sequence: true, receivedAt: true, deliveredAt: true },
        orderBy: { sequence: "asc" },
      },
      trackingNumber: true,
      status: true,
      packages: true,
      weightKg: true,
      description: true,
      customer: { select: { name: true, phone: true } },
      batch: { select: { batchNumber: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          currency: true,
          status: true,
        },
      },
      pickupNote: { select: { noteNumber: true, status: true } },
    },
  });

  if (!shipment) return fail("No shipment matches that code.");

  const meta = SHIPMENT_STATUS_META[shipment.status];
  const progress = packageProgress(shipment.packageList, shipment.packageType);

  const showMoney = can(user.role, "finance.view");
  const outstanding = shipment.invoice
    ? toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid)
    : null;

  const canRelease =
    can(user.role, "shipment.release") &&
    shipment.status === "READY_FOR_PICKUP" &&
    shipment.pickupNote?.status === "ACTIVE" &&
    // A shipment missing a box is not releasable, however well it is paid for.
    progress.complete;

  let verdict: ScanResult["verdict"];

  if (shipment.status === "DELIVERED") {
    verdict = {
      tone: "warn",
      headline: "Already collected",
      detail: "This cargo has been released. It should not be in the warehouse.",
    };
  } else if (shipment.status === "CANCELLED") {
    verdict = {
      tone: "block",
      headline: "Cancelled shipment",
      detail: "Management voided this shipment. Do not move or release it.",
    };
  } else if (can(user.role, "shipment.release")) {
    // Warehouse staff at the counter get a yes/no, not a report.
    if (canRelease && !progress.complete) {
      // Paid, noted, and still short a box. Handing over four of five is how a
      // claim starts, so the counter is told before the customer is.
      verdict = {
        tone: "block",
        headline: `Only ${progress.received} of ${progress.total} packages here`,
        detail: `Package ${progress.missing.join(", ")} has not been checked in. Do not release a partial shipment.`,
      };
    } else if (canRelease) {
      verdict = {
        tone: "ok",
        headline: "Cleared for release",
        detail: `Paid in full. Pickup note ${shipment.pickupNote?.noteNumber} is active — confirm the receiver's details before handing over.`,
      };
    } else if (shipment.status === "READY_FOR_PICKUP") {
      verdict = {
        tone: "block",
        headline: "Do not release",
        detail: "There is no active pickup note for this shipment.",
      };
    } else if (shipment.status === "RECEIVED_AT_DAR") {
      verdict = {
        tone: "block",
        headline: "Not paid yet",
        detail: "Cargo is in the warehouse but Finance has not cleared it.",
      };
    } else {
      verdict = {
        tone: "warn",
        headline: meta.label,
        detail: "This cargo has not been checked in at the Dar warehouse yet.",
      };
    }
  } else if (showMoney) {
    if (!shipment.invoice) {
      verdict = {
        tone: "warn",
        headline: "No invoice raised",
        detail: "This shipment has not been billed yet.",
      };
    } else if (shipment.invoice.status === "PAID") {
      verdict = {
        tone: "ok",
        headline: "Settled in full",
        detail: shipment.pickupNote
          ? `Pickup note ${shipment.pickupNote.noteNumber} (${shipment.pickupNote.status.toLowerCase()}).`
          : "Ready for a pickup note once the cargo is checked in.",
      };
    } else {
      verdict = {
        tone: "warn",
        headline: `${shipment.invoice.currency} ${outstanding?.toLocaleString()} outstanding`,
        detail: "Collect the balance before issuing a pickup note.",
      };
    }
  } else {
    verdict = {
      tone: "ok",
      headline: meta.label,
      detail: meta.description,
    };
  }

  return ok({
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    statusLabel: meta.label,
    customerName: shipment.customer.name,
    customerPhone: can(user.role, "customer.view")
      ? shipment.customer.phone
      : null,
    packages: shipment.packages,
    weightKg: toNumber(shipment.weightKg),
    scannedPackage: target.package
      ? {
          sequence: target.package.sequence,
          reference: target.package.reference,
          received: target.package.receivedAt !== null,
        }
      : null,
    progress: {
      total: progress.total,
      received: progress.received,
      missing: progress.missing,
      label: progress.label,
    },
    description: shipment.description,
    batchNumber: shipment.batch?.batchNumber ?? null,
    verdict,
    finance:
      showMoney && shipment.invoice
        ? {
            invoiceNumber: shipment.invoice.invoiceNumber,
            total: toNumber(shipment.invoice.total),
            amountPaid: toNumber(shipment.invoice.amountPaid),
            outstanding: outstanding ?? 0,
            currency: shipment.invoice.currency,
            status: shipment.invoice.status,
          }
        : null,
    pickupNote: shipment.pickupNote
      ? {
          noteNumber: shipment.pickupNote.noteNumber,
          status: shipment.pickupNote.status,
        }
      : null,
    canRelease,
  });
}
