"use server";

import { SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { t } from "@/lib/i18n";
import { packageProgress, resolveScannedCode } from "@/lib/packages";
import { findPickupLock, pickupLockMessage } from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import {
  fail,
  ok,
  toActionError,
  type ActionResult,
} from "@/lib/actions/types";

/**
 * One scan, the whole answer.
 *
 * A clerk at the Dar counter points a phone at the sticker on a carton with the
 * customer standing in front of them. What comes back has to be everything they
 * need to finish the handover — who the cargo belongs to, what is in it, how
 * many boxes are on the floor, whether it is paid for, and whether it may leave
 * the building — because there is no second screen. The scan lands on the
 * release page and the release page is where the job ends.
 *
 * Every field here is chosen for that moment, not for completeness. If a clerk
 * would not act on it while holding a box, it is not on this list.
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
  progress: {
    total: number;
    received: number;
    missing: number[];
    label: string;
    complete: boolean;
  };
  description: string;
  batchNumber: string | null;
  /**
   * The Guangzhou packing carton this cargo travelled inside, e.g. "GZ/26-22-7".
   * One carton holds many customers' goods, so this is how somebody actually
   * finds the box on the shelf.
   */
  cartonRef: string | null;
  arrivedAt: string | null;
  /** When it was handed over, for cargo somebody is trying to collect twice. */
  deliveredAtLabel: string | null;
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
  /**
   * The pickup note — the document the customer is holding.
   *
   * The amount is optional and gated on `finance.view`, because the owner's
   * rule is that warehouse staff get the payment FACT and never the figure.
   * The Dar counter is told the cargo is settled and which note settles it,
   * which is what it needs to hand a box over; the shillings are Finance's
   * and the CEO's. Same gate the pickup queue applies.
   */
  pickupNote: {
    id: string;
    noteNumber: string;
    status: string;
    issuedAt: string;
    amountPaid?: number;
    currency?: string;
  } | null;
  canRelease: boolean;
};

/**
 * Open a consignment from its pickup note, without a code.
 *
 * The by-hand fallback used to be handed each shipment's `qrToken` so it could
 * call resolveScan — which meant every cleared consignment's secret arrived in
 * the browser of anyone who opened this page, and the manual-entry box on the
 * scanner would happily accept one pasted back in. That turns "the box was
 * scanned" into a claim a clerk can type. Note ids are not secrets and prove
 * nothing, which is the honest shape for a path that has not scanned anything.
 */
export async function resolveScanByNote(
  noteId: string
): Promise<ActionResult<ScanResult>> {
  // Resolved before the permission check: a refusal is read by a person too,
  // and viewerLocale is request-cached, so asking early costs nothing.
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.scan");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const note = await prisma.pickupNote.findUnique({
    where: { id: noteId },
    select: { shipmentId: true },
  });
  if (!note) return fail(t(locale, "That pickup note no longer exists."));

  return describe(user, note.shipmentId, null);
}

export async function resolveScan(
  rawCode: string
): Promise<ActionResult<ScanResult>> {
  /**
   * Gated, not merely signed-in.
   *
   * An exported "use server" function is a POST endpoint that any authenticated
   * session can call directly, whatever the UI offers them. This one answers
   * "who owns this cargo, what is in it, has it been paid for" for an arbitrary
   * label, and three roles are deliberately denied scanning — Finance and
   * Support are never in front of a box, China prints labels and never reads
   * them. Checking only for a session let all three read the answer anyway.
   */
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.scan");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const target = await resolveScannedCode(rawCode);
  if (!target) return fail(t(locale, "That is not a Target Express label."));

  return describe(user, target.shipmentId, target.package ?? null);
}

/** The whole answer for one consignment, however the clerk arrived at it. */
async function describe(
  user: SessionUser,
  shipmentId: string,
  scannedPackage: {
    sequence: number;
    reference: string;
    receivedAt: Date | null;
  } | null
): Promise<ActionResult<ScanResult>> {
  // Resolved once for the whole payload: the cargo description, the dates and
  // the pickup-note date all have to come back in the same language, and
  // viewerLocale is request-cached so asking here costs nothing extra.
  const locale = await viewerLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
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
      ...selectText("description"),
      cartonRef: true,
      arrivedAt: true,
      deliveredAt: true,
      customer: { select: { name: true, phone: true } },
      batch: { select: { batchNumber: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          currency: true,
          status: true,
        },
      },
      pickupNote: {
        select: {
          id: true,
          noteNumber: true,
          status: true,
          issuedAt: true,
          amountPaid: true,
          currency: true,
        },
      },
    },
  });

  if (!shipment) return fail(t(locale, "No cargo matches that code."));

  const meta = SHIPMENT_STATUS_META[shipment.status];
  const progress = packageProgress(
    shipment.packageList,
    shipment.packageType,
    locale
  );

  const showMoney = can(user.role, "finance.view");
  const mayRelease = can(user.role, "shipment.release");
  const outstanding = shipment.invoice
    ? outstandingOf(shipment.invoice)
    : null;

  /**
   * The investigation lock, asked here as well as at the point of release.
   *
   * `releaseShipment` refuses locked cargo inside its transaction, which is the
   * guarantee. But a clerk who is told "Cleared for release", fills in the
   * receiver, photographs the handover and only then learns the box is under
   * investigation has been sent down a blind alley in front of a customer. The
   * scan is where that is cheap to say.
   *
   * Only looked up for someone who could act on it — this is a second query,
   * and a status board does not need it.
   */
  const lock = mayRelease ? await findPickupLock(prisma, shipment.id) : null;

  const noteActive = shipment.pickupNote?.status === "ACTIVE";
  const deliveredAtLabel = shipment.deliveredAt
    ? formatDate(shipment.deliveredAt, locale)
    : null;

  /*
    SHORT, BUT THE BOXES THAT CAME ARE THE CUSTOMER'S OWN GOODS.

    A missing box used to shut the counter outright, so eighteen cartons sat in
    Kariakoo while two were chased across China and the customer went home with
    nothing. The owner's decision is to hand over what arrived and keep chasing
    the rest, so the counter opens — and the form there asks for it to be
    agreed before anything moves.

    Only a short count. Every other lock says the box in front of the customer
    is not the box they are owed, and none of those is the counter's call.
  */
  const shortCountOnly = !lock || lock.type === "PACKAGE_COUNT_MISMATCH";
  const canRelease =
    mayRelease &&
    shipment.status === "READY_FOR_PICKUP" &&
    noteActive &&
    shortCountOnly &&
    (progress.complete || progress.received > 0);

  let verdict: ScanResult["verdict"];

  if (shipment.status === "DELIVERED") {
    verdict = {
      tone: "warn",
      headline: t(locale, "Already collected"),
      detail: t(
        locale,
        "This cargo has been released. It should not be in the warehouse."
      ),
    };
  } else if (shipment.status === "CANCELLED") {
    verdict = {
      tone: "block",
      headline: t(locale, "Cancelled cargo"),
      detail: t(
        locale,
        "Management voided this cargo. Do not move or release it."
      ),
    };
  } else if (mayRelease) {
    // Warehouse staff at the counter get a yes/no, not a report. The order of
    // these branches is the order the counter needs them: a live case outranks
    // a clean payment, and a missing box outranks both.
    if (lock) {
      verdict = {
        tone: "block",
        headline: t(locale, "Under investigation — do not release"),
        detail: pickupLockMessage(lock, shipment.trackingNumber, locale),
      };
    } else if (shipment.status !== "READY_FOR_PICKUP") {
      if (shipment.status === "RECEIVED_AT_DAR") {
        // Three different situations used to share one sentence. The counter
        // has to tell the customer something, and "not cleared" does not say
        // whether they owe money or are waiting on our own paperwork. Read off
        // the invoice; the figures still never leave this function.
        const settled = shipment.invoice?.status === "PAID";
        verdict = {
          tone: "block",
          headline: t(
            locale,
            settled ? "Paid — waiting for the note" : "Not paid yet"
          ),
          detail: t(
            locale,
            settled
              ? "The invoice is settled but Finance has not issued the pickup note. Ask them to release it."
              : !shipment.invoice
                ? "This cargo has not been billed yet. Finance prices it before it can be collected."
                : "The customer has not settled the invoice. They pay Finance first, and Finance issues the pickup note."
          ),
        };
      } else {
        verdict = {
          tone: "warn",
          headline: t(locale, meta.label),
          detail: t(
            locale,
            "This cargo has not been checked in at the Dar warehouse yet."
          ),
        };
      }
    } else if (shipment.pickupNote?.status === "CANCELLED") {
      // Finance voided a note they had already issued, which the customer very
      // likely watched them issue. Saying "no note" here starts an argument at
      // the counter that the clerk cannot win.
      verdict = {
        tone: "block",
        headline: t(locale, "Pickup note cancelled"),
        detail: `${t(locale, "Finance cancelled")} ${shipment.pickupNote.noteNumber}. ${t(locale, "Do not release this cargo — send the customer to Finance to find out why.")}`,
      };
    } else if (!shipment.pickupNote) {
      verdict = {
        tone: "block",
        headline: t(locale, "No pickup note"),
        detail: t(
          locale,
          "Finance issues the pickup note once the invoice is settled. Send the customer to Finance; do not release without one."
        ),
      };
    } else if (shipment.pickupNote.status === "USED") {
      // A stop, not a caution. Somebody presenting cargo that has already been
      // handed over is either mistaken or collecting it twice, and the amber
      // buzz is the same one the screen uses for "not here yet" — a routine,
      // wait-a-moment signal. This one has to feel different in the hand.
      verdict = {
        tone: "block",
        headline: t(locale, "Already collected — do not release"),
        detail: `${t(locale, "Pickup note")} ${shipment.pickupNote.noteNumber} ${t(locale, "was used on")} ${deliveredAtLabel ?? t(locale, "an earlier date")}. ${t(locale, "This cargo has left the warehouse. Send the customer to the office.")}`,
      };
    } else if (!progress.complete) {
      // Paid, noted, and still short a box. Handing over four of five is how a
      // claim starts, so the counter is told before the customer is.
      const boxes = progress.missing
        .map((n) => `${t(locale, "Package")} ${n}`)
        .join(locale === "zh" ? "、" : ", ");
      verdict = {
        tone: "block",
        headline: `${t(locale, "Only")} ${progress.received}/${progress.total} ${t(locale, "packages here")}`,
        detail: `${boxes} ${t(locale, "has not been checked in. Do not release a partial consignment.")}`,
      };
    } else {
      verdict = {
        tone: "ok",
        headline: t(locale, "Cleared — hand it over"),
        detail: `${t(locale, "Paid in full and pickup note")} ${shipment.pickupNote.noteNumber} ${t(locale, "is open. Check who is collecting, photograph the handover, release.")}`,
      };
    }
  } else if (showMoney) {
    if (!shipment.invoice) {
      verdict = {
        tone: "warn",
        headline: t(locale, "No invoice raised"),
        detail: t(locale, "This cargo has not been billed yet."),
      };
    } else if (shipment.invoice.status === "PAID") {
      verdict = {
        tone: "ok",
        headline: t(locale, "Settled in full"),
        detail: shipment.pickupNote
          ? `${t(locale, "Pickup note")} ${shipment.pickupNote.noteNumber} (${t(locale, shipment.pickupNote.status.toLowerCase())}).`
          : t(locale, "Ready for a pickup note once the cargo is checked in."),
      };
    } else {
      verdict = {
        tone: "warn",
        headline: `${shipment.invoice.currency} ${outstanding?.toLocaleString()} ${t(locale, "outstanding")}`,
        detail: t(locale, "Collect the balance before issuing a pickup note."),
      };
    }
  } else {
    verdict = {
      tone: "ok",
      headline: t(locale, meta.label),
      detail: t(locale, meta.description),
    };
  }

  return ok({
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    statusLabel: t(locale, meta.label),
    customerName: shipment.customer.name,
    customerPhone: can(user.role, "customer.view")
      ? shipment.customer.phone
      : null,
    packages: shipment.packages,
    weightKg: toNumber(shipment.weightKg),
    scannedPackage: scannedPackage
      ? {
          sequence: scannedPackage.sequence,
          reference: scannedPackage.reference,
          received: scannedPackage.receivedAt !== null,
        }
      : null,
    progress: {
      total: progress.total,
      received: progress.received,
      missing: progress.missing,
      label: progress.label,
      complete: progress.complete,
    },
    /*
      The description as this reader reads it.

      Guangzhou types "配件"; a Dar clerk holding the box sees "Accessories".
      The original is untouched in the row — this only chooses which of the
      renderings beside it to show, and falls back to what was typed when there
      is no rendering for their language.
    */
    description: cargoText(locale, shipment, "description"),
    batchNumber: shipment.batch?.batchNumber ?? null,
    cartonRef: shipment.cartonRef,
    arrivedAt: shipment.arrivedAt ? formatDate(shipment.arrivedAt, locale) : null,
    deliveredAtLabel,
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
          id: shipment.pickupNote.id,
          noteNumber: shipment.pickupNote.noteNumber,
          status: shipment.pickupNote.status,
          issuedAt: formatDate(shipment.pickupNote.issuedAt, locale),
          ...(showMoney
            ? {
                amountPaid: toNumber(shipment.pickupNote.amountPaid),
                currency: shipment.pickupNote.currency,
              }
            : {}),
        }
      : null,
    canRelease,
  });
}
