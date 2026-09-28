import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { holdCargoUntilSettled } from "@/lib/cargo-hold";
import { STORAGE_POLICY, storageStatus } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { invoiceStatusFor } from "@/lib/invoice-status";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * PUTTING THE ACCRUED STORAGE FEE ONTO ONE BILL.
 *
 * Lifted out of the server action it used to be, because two things now do
 * it: a desk pressing the button, and the system itself, nightly and at the
 * counter. Every guard, every figure and every audit line is the same either
 * way — the only difference is who is recorded as having done it, and a
 * system run records nobody, which is the honest answer.
 *
 * A WAIVER IS NOT A DELETION. `storageCharge` keeps what the policy produced
 * and `storageWaivedUsd` keeps what the business chose not to collect, so
 * "calculated", "charged" and "waived" are three separate figures that always
 * agree with each other.
 *
 * The freight price is never touched. Storage is its own line and its own
 * decision.
 *
 * BOTH FIGURES MOVE TOGETHER: `total` and `totalLocal`, the latter at the
 * invoice's OWN frozen rate, never today's — the point of freezing a rate is
 * that a quoted figure cannot move under the customer.
 */
export type StorageChargeOutcome =
  | { charged: true; usd: number; total: number; held: string }
  | { charged: false; reason: string };

/** Recompute from the dates, so the figure can never be stale or typed. */
export async function currentStorage(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
      storageCharge: true,
      storageDays: true,
      storageWaivedUsd: true,
      storageWaivedAt: true,
      freightCost: true,
      freightOverride: true,
      otherCharges: true,
      discount: true,
      exchangeRate: true,
      shipment: {
        select: {
          trackingNumber: true,
          arrivedAt: true,
          deliveredAt: true,
        },
      },
    },
  });
  if (!invoice) return null;
  const status = storageStatus(
    invoice.shipment?.arrivedAt ?? null,
    invoice.shipment?.deliveredAt ?? null
  );
  return { invoice, status };
}

export async function chargeStorageOn(
  invoiceId: string,
  actor: SessionUser | null,
  locale: Locale,
  opts: {
    /**
     * Leave a waived bill alone.
     *
     * The nightly meter passes true: somebody decided these days would not be
     * collected, and a sweep that put them back the next morning would undo a
     * decision nobody made again. A desk pressing "Charge it after all" passes
     * false, which is the whole point of that button.
     */
    respectWaiver: boolean;
  }
): Promise<StorageChargeOutcome> {
  const found = await currentStorage(invoiceId);
  if (!found) {
    return { charged: false, reason: t(locale, "That invoice no longer exists.") };
  }
  const { invoice, status } = found;

  if (status.chargeUsd <= 0) {
    return {
      charged: false,
      reason: t(
        locale,
        "Nothing to charge — this cargo is still inside its free days."
      ),
    };
  }
  if (opts.respectWaiver && invoice.storageWaivedAt !== null) {
    return {
      charged: false,
      reason: t(locale, "Storage on this cargo has been waived."),
    };
  }

  const before = toNumber(invoice.storageCharge);
  if (before === status.chargeUsd && toNumber(invoice.storageWaivedUsd) === 0) {
    return {
      charged: false,
      reason: t(locale, "That storage fee is already on the bill."),
    };
  }

  let total = 0;
  let rate: number | null = null;
  let totalLocal: number | null = null;
  let held = "none";

  await prisma.$transaction(async (tx) => {
    /*
      THE MONEY FIELDS ARE RE-READ INSIDE THE TRANSACTION. Computing the new
      total from a read taken before the transaction opened silently wrote
      over a payment landing in between. The storage CLOCK may stay from the
      pre-read — it is derived from dates, not from the row's money.
    */
    const fresh = await tx.invoice.findUnique({
      where: { id: invoice.id },
      select: {
        status: true,
        amountPaid: true,
        amountAdjusted: true,
        freightCost: true,
        freightOverride: true,
        otherCharges: true,
        discount: true,
        exchangeRate: true,
        total: true,
        /* The clearance this charge may have to withdraw — see below. */
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            pickupNote: { select: { id: true, noteNumber: true, status: true } },
          },
        },
      },
    });
    if (!fresh) throw new Error(t(locale, "That invoice no longer exists."));

    /* A dead bill cannot grow. VOID and WRITTEN_OFF are final words. */
    if (fresh.status === "VOID" || fresh.status === "WRITTEN_OFF") {
      throw new Error(
        `${invoice.invoiceNumber} ${t(
          locale,
          "is closed, so nothing more can be charged on it."
        )}`
      );
    }

    const freight =
      fresh.freightOverride === null
        ? toNumber(fresh.freightCost)
        : toNumber(fresh.freightOverride);
    total =
      freight +
      status.chargeUsd +
      toNumber(fresh.otherCharges) -
      toNumber(fresh.discount);
    rate = fresh.exchangeRate === null ? null : toNumber(fresh.exchangeRate);
    totalLocal = rate === null ? null : toLocal(total, rate);

    /*
      THE STATUS FOLLOWS THE TOTAL. Charging storage on a settled bill used to
      leave status at PAID while the total rose above amountPaid — and the
      pickup gate reads the status, so the cargo walked out with the storage
      unpaid.
    */
    const paidSoFar = toNumber(fresh.amountPaid);
    const nextStatus =
      invoiceStatusFor(
        fresh.status,
        paidSoFar,
        total,
        toNumber(fresh.amountAdjusted)
      ) ?? fresh.status;

    /* Conditional on the total this transaction read: a concurrent change
       makes this touch nothing, and the caller is told to look again. */
    const claimed = await tx.invoice.updateMany({
      where: { id: invoice.id, total: fresh.total },
      data: {
        storageDays: status.chargeableDays,
        storageCharge: new Prisma.Decimal(status.chargeUsd),
        /* Charging replaces any earlier waiver on the same invoice — the
           decision has been reversed, and the audit log carries both. */
        storageWaivedUsd: new Prisma.Decimal(0),
        storageWaivedAt: null,
        storageWaivedById: null,
        storageWaiveReason: null,
        total: new Prisma.Decimal(total),
        totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        status: nextStatus,
      },
    });
    if (claimed.count === 0) {
      throw new Error(
        t(locale, "This bill changed a moment ago. Reload the page and look again.")
      );
    }

    /*
      THE CLEARANCE GOES WITH THE DEBT.

      A pickup note is the company saying the bill is settled and the cargo may
      go. Charging storage on a settled bill reopens it — and the note said
      nothing about storage, so the boxes would walk out on a clearance that
      was true when printed and false by the time it was used.

      A note already USED is left alone and said out loud in the audit line:
      the cargo has gone, and cancelling the note would only make the record
      disagree with the warehouse. That is a live debt for somebody to chase.
    */
    const cargo = fresh.shipment;
    const note = cargo?.pickupNote ?? null;
    held = await holdCargoUntilSettled(tx, {
      shipment: cargo,
      nextStatus,
      actorId: actor?.id ?? null,
      reason:
        "Storage charged. Held until the new balance is settled; the pickup note it holds stands.",
    });

    await recordAudit(
      {
        actor,
        action: "storage.charged",
        entity: "Invoice",
        entityId: invoice.id,
        summary:
          `${invoice.invoiceNumber}: storage fee of USD ${status.chargeUsd.toFixed(2)} charged — ${status.chargeableDays} day(s) beyond the ${STORAGE_POLICY.freeDays} free days` +
          (actor ? "" : " — added by the storage meter") +
          (held === "already-collected"
            ? ` — WARNING: pickup note ${note?.noteNumber} was already used, the cargo has been collected and this storage is now a live debt`
            : held === "held"
              ? ` — ${cargo?.trackingNumber} held against pickup note ${note?.noteNumber} until the storage is paid`
              : ""),
        metadata: {
          tracking: invoice.shipment?.trackingNumber ?? null,
          automatic: actor === null,
          pickupNote: note?.noteNumber ?? null,
          pickupNoteOutcome: held,
          cargoAlreadyCollected: held === "already-collected",
          daysInWarehouse: status.daysInWarehouse,
          freeDays: STORAGE_POLICY.freeDays,
          chargeableDays: status.chargeableDays,
          perDayUsd: STORAGE_POLICY.perDayUsd,
          storageUsd: status.chargeUsd,
          previousStorageUsd: before,
          newTotal: total,
          exchangeRate: rate,
          newTotalLocal: totalLocal,
        },
      },
      tx
    );
  });

  return { charged: true, usd: status.chargeUsd, total, held };
}
