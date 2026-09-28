import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { applyCreditToInvoice } from "@/lib/customer-credit";
import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  storageDaysFor,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY, billingRate, toLocal } from "@/lib/fx";
import { nextPickupNoteNumber } from "@/lib/ids";
import { invoiceStatusFor } from "@/lib/invoice-status";
import { outstandingOf } from "@/lib/invoice-balance";
import { poolShareFor } from "@/lib/minimum-pool";
import { isDarConfirmed, notPayableMessage } from "@/lib/payable";
import { prisma } from "@/lib/prisma";
import { quote } from "@/lib/pricing";
import { can } from "@/lib/rbac";
import { type SessionUser } from "@/lib/session";

/**
 * Finance signs the system's price off.
 *
 * This RE-DERIVES rather than flipping a status, and that is the whole point.
 * A draft raised the day cargo landed carries zero storage days, because
 * storage is measured from arrival to now. Confirming it three weeks later by
 * flipping a flag would bill three weeks of storage at zero — the single
 * largest revenue leak available in this design. Re-pricing at the moment of
 * confirmation also picks up a weight corrected after arrival, and re-freezes
 * the exchange rate onto the figure the customer is actually about to be sent.
 *
 * What Finance typed onto the draft survives: notes, discount and other
 * charges are carried through, and only the derived parts move.
 */
/*
  NOT A SERVER ACTION — the permission is checked by whoever calls it.

  Two doors reach the same work. Finance pressing Confirm holds
  invoice.priceConfirm and is checked at the door. The warehouse checking the
  last box off a manifest holds no such thing and is not deciding anything:
  the rate book priced the cargo on the weight the floor just confirmed, and
  a draft that nobody needs to look at is signed off by the policy in
  confirmClean rather than by the clerk. So the permission cannot live in
  here, and this file is deliberately not one a URL can reach.
*/
export async function confirmPrice(
  user: SessionUser,
  invoiceId: string
): Promise<{ invoiceNumber: string; total: number; shipmentId: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        discount: true,
        otherCharges: true,
        freightOverride: true,
        freightRateOverride: true,
        /* The three the deposit needs: whose money may settle this, in what
           currency, and what has already been put against it. */
        customerId: true,
        currency: true,
        amountPaid: true,
        amountAdjusted: true,
        /* So re-pricing can see a waiver and leave it alone. */
        storageWaivedUsd: true,
        /* And a granted credit, whose due date it must not overwrite. */
        creditStatus: true,
        notes: true,
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            cargoCategory: true,
            cargoTypeId: true,
            weightKg: true,
            packages: true,
            arrivedAt: true,
            deliveredAt: true,
            customerId: true,
            /* The two facts that decide whether a deposit settling this bill
               may also release the cargo — see the block after the credit is
               applied. */
            pickupNote: { select: { id: true } },
            exceptions: {
              where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "DRAFT") {
      throw new Error(
        `${invoice.invoiceNumber} has already been confirmed.`
      );
    }

    /*
      THE LOCK THE WHOLE RULE HANGS ON.

      A DRAFT is the system's own estimate; confirming one is what turns it
      into a bill somebody can be asked to pay, and almost every screen in
      the app already draws the line at DRAFT. So this is where "no Dar
      confirmation, no final price" has to be enforced — hold it here and
      the merge screen, the chase list, the outstanding tiles and the
      reports all follow without being touched, because none of them counts
      a draft.

      Not gated on arrivedAt: that stamp is set on cargo still recorded as
      in the air (dispatch does not clear it), so it says nothing about
      whether the floor has the boxes.
    */
    if (!isDarConfirmed(invoice.shipment.status)) {
      throw new Error(notPayableMessage(invoice.shipment.trackingNumber));
    }

    const shipment = invoice.shipment;
    const priced = await quote({
      category: shipment.cargoCategory,
      cargoTypeId: shipment.cargoTypeId,
      weightKg: toNumber(shipment.weightKg),
      quantity: shipment.packages,
    });
    if (!priced.ok) {
      throw new Error(
        `${shipment.trackingNumber} still cannot be priced: ${priced.message}`
      );
    }

    /*
      THE MINIMUM THIS CUSTOMER IS ALREADY PAYING ON THIS FLIGHT.

      Re-pricing here quotes the consignment ON ITS OWN, which is right for
      the rate and the storage clock and wrong for the route's minimum
      billable weight: that one belongs to the customer's whole flight, not
      to one parcel. Without this, a bill that check-in had correctly zeroed
      came back at the full minimum the moment Finance pressed Confirm, and a
      customer with two light parcels paid it twice again — the desk doing
      its job undoing the fix.

      Null for everything not in a pool, which is nearly all cargo, and then
      the rate book's own figure stands exactly as it did.
    */
    const share = await poolShareFor(shipment.id);
    const freight = share ? share.freight : priced.total;

    // Recomputed here, not read off the draft — this is the leak the whole
    // action exists to close.
    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    /*
      A waiver survives re-pricing.

      Re-deriving storage from the dates is right — the clock has usually
      moved — but doing it blindly resurrects a fee somebody deliberately
      forgave, and the customer is billed for it a second time without
      anybody deciding so. If this invoice carries a waiver, storage stays
      at nothing and the waived figure stands; charging it again is a
      decision, and decisions are made on the storage card.
    */
    const waivedUsd = toNumber(invoice.storageWaivedUsd);
    const storageCharge =
      waivedUsd > 0 ? 0 : storageDays * STORAGE_POLICY.perDayUsd;
    const discount = toNumber(invoice.discount);
    const otherCharges = toNumber(invoice.otherCharges);

    // A freight correction Finance already made SURVIVES confirmation.
    //
    // What confirming re-derives is what time changed — storage days accrued
    // since the draft, and today's exchange rate. A figure a person decided,
    // wrote a reason against and saw saved is not something time changed, and
    // re-deriving it silently un-does their work: correct a line, press
    // "Confirm all", and the correction is gone with nothing to show it ever
    // happened. The rate-book figure still goes to freightCost, so the
    // variance stays visible.
    const override =
      invoice.freightOverride === null
        ? null
        : toNumber(invoice.freightOverride);
    const billedFreight = override ?? freight;
    const total = billedFreight + storageCharge + otherCharges - discount;
    if (total < 0) {
      throw new Error(
        "The discount on this draft is larger than the rest of the invoice."
      );
    }

    /* A bill without a rate cannot be stated in the money the customer pays
       in, so it is not allowed to exist. billingRate falls back to the
       earliest rate ever published when nothing was effective yet; only an
       empty rate book returns null, and that is a setup fault, not a bill. */
    const rate = await billingRate(new Date());
    if (rate === null) {
      throw new Error(
        "No exchange rate has ever been published, so this bill cannot be stated in shillings. Publish a USD→TZS rate in Pricing & Configuration first."
      );
    }
    const totalLocal = rate === null ? null : toLocal(total, rate);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        /* The pooled figure where this consignment shares a minimum, so the
           stored freight and the total it is inside agree with each other. */
        freightCost: new Prisma.Decimal(freight),
        storageDays,
        storageCharge: new Prisma.Decimal(storageCharge),
        total: new Prisma.Decimal(total),
        exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        /*
          A CONFIRMED BILL THAT ASKS FOR NOTHING IS SETTLED, NOT UNPAID.

          This wrote UNPAID whatever the figure was, and the pickup gate
          reads that word rather than the total — so a bill confirmed at
          USD 0.00 refused its own cargo with "USD 0 is still outstanding".
          A consignment can legitimately come to nothing: one of a
          customer's parcels on a flight carries the route's minimum and its
          siblings carry none.

          There is no way round it from a desk either. A payment of zero is
          refused by the payment schema, and clearing the balance is refused
          on a bill with nothing left owing — so the parcel simply stayed in
          the warehouse.
        */
        status: total <= 0.005 ? "PAID" : "UNPAID",
        confirmedAt: new Date(),
        confirmedById: user.id,
        /*
          Payable before the cargo is released — which is what issuePickupNote
          already enforces, so the terms say what is true.

          UNLESS credit has been granted on this bill. Credit stores its
          deadline in this same column, so re-confirming a price afterwards
          used to stamp today's date over the terms the customer was given: a
          30-day credit approved last week became overdue the moment somebody
          re-confirmed the figure, on the settlements page, on the call list
          and on the pickup note the customer is holding. Re-pricing is not a
          reason to move a deadline anybody agreed to.
        */
        ...(invoice.creditStatus === "APPROVED" ? {} : { dueDate: new Date() }),
      },
    });

    /*
      THE DEPOSIT SETTLES THE BILL THE MOMENT THE BILL EXISTS.

      A customer whose cargo was still in China when they paid has money
      sitting against nothing — the price could not be worked out until Dar
      weighed the boxes, so no invoice existed to take it. This is the first
      instant one does: the draft has just become a real bill with a
      confirmed price, which is exactly when money is allowed to touch it.

      Not at invoice creation, which is a DRAFT — nobody has agreed that
      figure yet, and taking money against a price nobody has looked at is
      the thing the confirm step exists to prevent.

      Anything left over stays as their credit for the next consignment, and
      a bill this clears in full releases its own cargo below.
    */
    const applied = await applyCreditToInvoice(tx, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      currency: invoice.currency,
      /* This bill's own frozen rate, so a deposit taken in shillings can
         answer a dollar bill at the figure the customer was quoted. Without
         it only same-currency money is visible, which is how a customer who
         paid in March got asked again in August. */
      invoiceRate: rate,
      /*
        WHAT THE BILL OWES, NOT WHAT IT WAS BILLED LESS WHAT WAS PAID.

        Written out as a subtraction here, this took the customer's deposit
        against a gap Finance had already cleared: a bill of 100 with 60 paid
        and 40 written off owes nothing, and this asked for 40 of somebody's
        money to settle it. `outstandingOf` is the one function that knows
        about the third column, and its argument is required so a caller
        cannot leave it out.
      */
      outstanding: outstandingOf({
        total,
        amountPaid: invoice.amountPaid,
        amountAdjusted: invoice.amountAdjusted,
      }),
      user,
    });

    if (applied > 0.005) {
      const nowPaid = toNumber(invoice.amountPaid) + applied;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: new Prisma.Decimal(nowPaid),
          /* Through invoiceStatusFor like every other door that moves a
             paid figure — the ternary here could not see a write-off, so a
             bill whose remainder Finance had cleared was stamped
             PARTIALLY_PAID and its cargo stopped being releasable.

             Against UNPAID, which is the status the update above has just
             written: `invoice.status` is still the DRAFT this call is in the
             middle of lifting, and invoiceStatusFor deliberately refuses to
             overturn a draft. */
          status:
            invoiceStatusFor(
              "UNPAID",
              nowPaid,
              total,
              toNumber(invoice.amountAdjusted)
            ) ?? undefined,
        },
      });

      /*
        A DEPOSIT THAT SETTLES THE BILL RELEASES THE CARGO TOO.

        The bill went to PAID and the consignment stayed on the shelf. Every
        other door that settles a bill in full issues the note that lets the
        boxes out — the counter does it, and finding lost cargo does it — but
        a customer who had paid in advance, whose bill was settled by their
        own deposit the moment Dar priced it, was left waiting for somebody
        to notice and issue one by hand. Nothing on any screen said so: the
        bill read PAID and the cargo read RECEIVED_AT_DAR.

        The same four conditions the counter applies, for the same reasons:
        the bill is actually settled, the boxes are on the Dar floor, no note
        exists already (PickupNote.shipmentId is unique), and no investigation
        is holding the cargo. And the same authority — a note is only ever
        minted by somebody holding pickupNote.issue.
      */
      const settledNow =
        nowPaid + toNumber(invoice.amountAdjusted) + 0.005 >= total;
      if (
        settledNow &&
        shipment.status === "RECEIVED_AT_DAR" &&
        shipment.pickupNote == null &&
        shipment.exceptions.length === 0 &&
        can(user.role, "pickupNote.issue")
      ) {
        const note = await tx.pickupNote.create({
          data: {
            noteNumber: await nextPickupNoteNumber(tx),
            shipmentId: shipment.id,
            customerId: shipment.customerId,
            amountPaid: new Prisma.Decimal(nowPaid),
            currency: invoice.currency,
            issuedById: user.id,
          },
        });
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: "READY_FOR_PICKUP", readyForPickup: new Date() },
        });
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: "RECEIVED_AT_DAR",
            toStatus: "READY_FOR_PICKUP",
            location: "Dar es Salaam warehouse",
            note: `Settled from the customer's deposit when the price was confirmed. Pickup note ${note.noteNumber} issued.`,
            actorId: user.id,
          },
        });
      }
    }

    // Keep the working on the shipment in step with the confirmed figure.
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        quotedAmount: new Prisma.Decimal(priced.total),
        quoteCurrency: priced.currency,
        quotedMethod: priced.method,
        quotedRate: new Prisma.Decimal(priced.rate),
        chargeableKg:
          priced.chargeableWeightKg === null
            ? null
            : new Prisma.Decimal(priced.chargeableWeightKg),
        currency: priced.currency,
      },
    });

    await recordAudit(
      {
        actor: user,
        action: "invoice.confirm",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Confirmed ${invoice.invoiceNumber} for ${shipment.trackingNumber}: ${priced.currency} ${total.toFixed(2)}`,
        metadata: {
          method: priced.method,
          rate: priced.rate,
          chargeableKg: priced.chargeableWeightKg,
          storageDays,
          discount,
          otherCharges,
          exchangeRate: rate,
          totalLocal,
        },
      },
      tx
    );

    return { invoiceNumber: invoice.invoiceNumber, total, shipmentId: shipment.id };
  });

  revalidatePath(`/app/cargo/${result.shipmentId}`);
  revalidatePath("/app/finance/invoices");
  revalidatePath("/app/finance");
  return result;
}


/**
 * THE DRAFTS NOBODY NEEDS TO LOOK AT, SIGNED OFF AT CHECK-IN.
 *
 * The owner's question, twice in one day: why does the price have to be
 * confirmed by hand when the kilos already decided it? For ordinary cargo he
 * is right — the warehouse weighs the boxes, the rate book multiplies, and
 * Finance pressing Confirm adds a queue and a delay to a figure nobody
 * disagrees with. The customer cannot be quoted, cannot pay and cannot
 * collect until somebody presses it.
 *
 * So the press is kept for the three cases where a person really is deciding
 * something:
 *
 *   · no rate in the book for this cargo — auto-pricing says so on the
 *     shipment, and the bill has to be priced by hand;
 *   · a case open on the consignment — missing boxes, damage, a wrong count;
 *     what it weighs is not yet what it is;
 *   · a special rate on the bill — somebody is part-way through agreeing a
 *     price with this customer, and confirming it would close that.
 *
 * Everything else is confirmed here, by the same code Finance's button runs,
 * with the clerk who checked the boxes in recorded as who did it. A failure
 * is never allowed to reach the check-in: the draft stays a draft and Finance
 * confirms it the old way, which is exactly where this started.
 */
export async function confirmClean(shipmentIds: string[], user: SessionUser) {
  if (shipmentIds.length === 0) return { confirmed: [], left: [] };

  const candidates = await prisma.shipment.findMany({
    where: {
      id: { in: shipmentIds },
      pricingBlockedReason: null,
      exceptions: { none: { status: { in: [...EXCEPTION_OPEN_STATUSES] } } },
      invoice: {
        status: "DRAFT",
        /* A rate somebody typed, in either shape it takes — a per-kilo figure
           agreed with the customer, or a lump sum written over the freight. */
        freightRateOverride: null,
        freightOverride: null,
      },
    },
    select: {
      id: true,
      trackingNumber: true,
      invoice: { select: { id: true } },
    },
  });

  const confirmed: string[] = [];
  const left: string[] = [];
  for (const shipment of candidates) {
    if (!shipment.invoice) continue;
    try {
      await confirmPrice(user, shipment.invoice.id);
      confirmed.push(shipment.trackingNumber);
    } catch (error) {
      /* Swallowed on purpose. The draft is still there and still correct; all
         that is lost is the automatic sign-off, and Finance's button does the
         same work. A check-in must never fail over this — see
         priceAfterCheckIn, which this is called from. */
      console.error("Could not confirm a clean price at check-in", {
        trackingNumber: shipment.trackingNumber,
        error,
      });
      left.push(shipment.trackingNumber);
    }
  }
  return { confirmed, left };
}
