"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type AccountKind } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { settleBatchIfClear } from "@/lib/batch-close";
import { applyCreditToInvoice } from "@/lib/customer-credit";
import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import {
  PICKUP_LOCKING_STATUSES,
  PICKUP_LOCKING_TYPES,
} from "@/lib/pickup-lock";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { invoiceStatusFor } from "@/lib/invoice-status";
import {
  LOCAL_CURRENCY,
  billingRate,
  currentRateValue,
  toLocal,
} from "@/lib/fx";
import { postLedgerEntry } from "@/lib/ledger";
import { quote } from "@/lib/pricing";
import {
  nextInvoiceNumber,
  nextPickupNoteNumber,
  nextReceiptNumber,
} from "@/lib/ids";
import { companySettings } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import {
  COLLECTABLE_SHIPMENT_WHERE,
  isCollectable,
  isDarConfirmed,
  notPayableMessage,
} from "@/lib/payable";
import { claimsForInvoices, pendingClaimWhere } from "@/lib/claimed";
import { filesFrom, putDocument } from "@/lib/storage";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { methodForKind } from "@/lib/accounts";
import { idempotencyKeyFrom, isRepeatSubmission } from "@/lib/idempotency";
import { type Locale } from "@/lib/locale";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import {
  discountSchema,
  invoiceRateSchema,
  customerPaymentSchema,
  firstError,
  paymentSchema,
} from "@/lib/validation";

/** Midnight on the given day, for comparing a date-only input against a timestamp. */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * One-click invoice.
 *
 * Everything is derived: the rate comes from the published rate book via the
 * shipment's cargo category, storage comes from how long the cargo has actually
 * been sitting, and the quote snapshot is written back onto the shipment so the
 * figure can be explained months later.
 *
 * Nobody types a price. That is the point — a warehouse clerk cannot influence
 * it and a finance clerk cannot mistype it.
 */
export async function generateInvoice(
  _prev: ActionResult<{ invoiceNumber: string; total: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ invoiceNumber: string; total: number }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail("Missing cargo.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          customerId: true,
          cargoCategory: true,
          cargoTypeId: true,
          weightKg: true,
          volumeCbm: true,
          packages: true,
          status: true,
          arrivedAt: true,
          deliveredAt: true,
          invoice: {
            select: {
              id: true,
              amountPaid: true,
              invoiceNumber: true,
              storageWaivedUsd: true,
            },
          },
        },
      });
      if (!shipment) throw new Error("Cargo not found.");

      /*
        NOTHING IS BILLED BEFORE IT LANDS.

        The price is worked out from the weight and the piece count the Dar
        floor confirms when it checks the boxes off the manifest — that is why
        autoPriceShipments runs there and nowhere else. A bill raised while the
        cargo is still in the air prices a packing list, and a customer who
        pays that figure has to be argued with afterwards when the real weight
        turns out different.

        It had no guard at all: two bills were raised by hand on a flight that
        had not left Guangzhou's airspace, one of them was paid, and neither
        could be taken back. Refused here rather than only hidden in the
        markup, because this action is reachable without the button.
      */
      if (
        shipment.status !== "RECEIVED_AT_DAR" &&
        shipment.status !== "READY_FOR_PICKUP" &&
        shipment.status !== "DELIVERED"
      ) {
        throw new Error(
          `${shipment.trackingNumber} ${t(locale, "has not been checked in at Dar yet, so there is no final weight to price. The system raises the bill by itself the moment the warehouse checks it off the manifest.")}`
        );
      }

      if (shipment.invoice && toNumber(shipment.invoice.amountPaid) > 0) {
        throw new Error(
          `${shipment.invoice.invoiceNumber} already has money against it and cannot be regenerated.`
        );
      }

      const priced = await quote({
        category: shipment.cargoCategory,
        cargoTypeId: shipment.cargoTypeId,
        weightKg: toNumber(shipment.weightKg),
        quantity: shipment.packages,
      });

      if (!priced.ok) {
        throw new Error(
          `${shipment.trackingNumber} cannot be priced yet: ${priced.message}`
        );
      }

      const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
      /*
        A WAIVER SURVIVES A REGENERATE. Rebuilding the bill used to re-charge
        the storage while leaving the waiver record standing — an invoice that
        said "charged" and "waived" at once, the exact state chargeStorageFee
        and waiveStorageFee are written to make impossible. A fee somebody
        forgave stays forgiven; reversing that decision is chargeStorageFee's
        job, on the record, not a side effect of re-pricing the freight.
      */
      const waiverStands =
        shipment.invoice !== null &&
        toNumber(shipment.invoice.storageWaivedUsd) > 0;
      const storageCharge = waiverStands
        ? 0
        : storageDays * STORAGE_POLICY.perDayUsd;
      const total = priced.total + storageCharge;

      // Freeze today's rate onto the invoice. A later change must never move a
      // figure a customer has already been quoted.
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

      // Keep the working on the shipment so a customer query in three months
      // does not require re-deriving today's rate.
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

      const data = {
        customerId: shipment.customerId,
        currency: priced.currency,
        freightCost: new Prisma.Decimal(priced.total),
        storageDays,
        storageCharge: new Prisma.Decimal(storageCharge),
        otherCharges: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        // This action exists to re-price from the rate book, so any earlier
        // correction is deliberately dropped — but it is CLEARED rather than
        // ignored. A stored override the total does not honour is a row that
        // contradicts itself, and the invoice document reads one of the two.
        freightOverride: null,
        freightOverrideReason: null,
        total: new Prisma.Decimal(total),
        exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        notes: storageDays
          ? `Includes ${storageDays} chargeable storage day(s) at ${STORAGE_POLICY.currency} ${STORAGE_POLICY.perDayUsd}/day.`
          : null,
        /**
         * The accounts as they stand at this moment, kept with the invoice.
         *
         * An invoice is a legal document: the account a customer paid into has
         * to be reproducible from the invoice itself. Now that an owner can
         * change a Lipa number from the settings page, re-rendering last
         * year's PDF would otherwise print this year's accounts and quietly
         * contradict the copy the customer is holding.
         */
        paymentSnapshot: (await companySettings()).accounts as Prisma.InputJsonValue,
      };

      const invoice = shipment.invoice
        ? await tx.invoice.update({
            where: { id: shipment.invoice.id },
            data,
            select: { invoiceNumber: true, total: true },
          })
        : await tx.invoice.create({
            data: {
              ...data,
              invoiceNumber: await nextInvoiceNumber(tx),
              shipmentId: shipment.id,
              issuedById: user.id,
            },
            select: { invoiceNumber: true, total: true },
          });

      await recordAudit(
        {
          actor: user,
          action: shipment.invoice ? "invoice.regenerate" : "invoice.generate",
          entity: "Invoice",
          entityId: shipment.id,
          summary: `${shipment.invoice ? "Regenerated" : "Generated"} ${invoice.invoiceNumber} for ${shipment.trackingNumber}: ${priced.currency} ${total.toFixed(2)}`,
          metadata: {
            method: priced.method,
            rate: priced.rate,
            chargeableKg: priced.chargeableWeightKg,
            storageDays,
            ruleId: priced.ruleId,
            exchangeRate: rate,
            totalLocal,
          },
        },
        tx
      );

      return { invoiceNumber: invoice.invoiceNumber, total };
    });

    revalidatePath(`/app/cargo/${shipmentId}`);
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/finance");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

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
export async function confirmInvoicePrice(
  _prev: ActionResult<{ invoiceNumber: string; total: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ invoiceNumber: string; total: number }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return fail("Missing invoice.");

  try {
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
          /* The three the deposit needs: whose money may settle this, in what
             currency, and what has already been put against it. */
          customerId: true,
          currency: true,
          amountPaid: true,
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
      const billedFreight = override ?? priced.total;
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
          freightCost: new Prisma.Decimal(priced.total),
          storageDays,
          storageCharge: new Prisma.Decimal(storageCharge),
          total: new Prisma.Decimal(total),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          localCurrency: LOCAL_CURRENCY,
          totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
          status: "UNPAID",
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
        outstanding: total - toNumber(invoice.amountPaid),
        user,
      });

      if (applied > 0.005) {
        const nowPaid = toNumber(invoice.amountPaid) + applied;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: new Prisma.Decimal(nowPaid),
            status: nowPaid + 0.001 >= total ? "PAID" : "PARTIALLY_PAID",
          },
        });
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
    return ok({ invoiceNumber: result.invoiceNumber, total: result.total });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Sign off every draft on one dispatch.
 *
 * The owner's flow: Finance opens a flight, reads down the list, corrects
 * anything that looks wrong, and presses one button. Eighty-seven consignments
 * is eighty-seven presses otherwise, which is how a desk stops checking.
 *
 * Each draft is confirmed in its own transaction so one unpriceable line
 * cannot roll back the eighty-three before it, and each writes its own audit
 * entry — a bulk action must leave the same trail as doing it by hand, or the
 * record cannot answer "who agreed this price".
 *
 * Skips rather than fails: already confirmed, already paid, or still
 * unpriceable. The count comes back so the desk is told what was left behind.
 */
export async function confirmBatchPrices(
  _prev: ActionResult<{ confirmed: number; skipped: number; blocked: string[] }> | undefined,
  formData: FormData
): Promise<ActionResult<{ confirmed: number; skipped: number; blocked: string[] }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail("Missing dispatch.");

  const drafts = await prisma.invoice.findMany({
    where: { status: "DRAFT", shipment: { batchId, deletedAt: null } },
    select: { id: true, shipment: { select: { trackingNumber: true } } },
  });

  if (drafts.length === 0) {
    return fail("Every price on this dispatch has already been confirmed.");
  }

  let confirmed = 0;
  let skipped = 0;
  const blocked: string[] = [];

  for (const draft of drafts) {
    const form = new FormData();
    form.set("invoiceId", draft.id);
    // Reuses the single-invoice action rather than duplicating its arithmetic:
    // the re-derive, the audit entry and the guards are the same code, so
    // confirming eighty-four at once cannot mean something different from
    // confirming one.
    const result = await confirmInvoicePrice(undefined, form);
    if (result.ok) confirmed += 1;
    else if (/already been confirmed/.test(result.error)) skipped += 1;
    else blocked.push(draft.shipment.trackingNumber);
  }

  await recordAudit({
    actor: user,
    action: "invoice.confirmBatch",
    entity: "Batch",
    entityId: batchId,
    summary: `Confirmed ${confirmed} price(s) on one dispatch${blocked.length ? `, ${blocked.length} could not be priced` : ""}`,
    metadata: { confirmed, skipped, blocked },
  });

  revalidatePath(`/app/shipments/${batchId}`);
  revalidatePath("/app/finance/invoices");
  revalidatePath("/app/finance");
  return ok({ confirmed, skipped, blocked });
}

/**
 * Adjusts an invoice before the customer has paid anything.
 *
 * Three guards, all of them there because money is involved:
 *
 *  1. Once a single shilling has landed, the invoice is frozen. A bill that can
 *     change after part payment is a bill nobody can reconcile.
 *  2. A discount needs invoice.discount, separately from invoice.edit — fixing a
 *     typo in the notes and giving away USD 40 are not the same authority.
 *  3. The rate override is stored on the invoice, so a reprint months later
 *     shows the figure the customer was actually given.
 *
 * Freight and storage are NOT editable here: they come from the rate book and
 * the arrival date. Discounts and extra charges are the honest way to adjust a
 * total, because they leave a line on the invoice explaining why.
 */
export async function adjustInvoice(
  _prev: ActionResult<{ total: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ total: number }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.edit");
  } catch (error) {
    return fail(toActionError(error));
  }

  const schema = z.object({
    invoiceId: z.string().trim().min(1, "Missing invoice."),
    discount: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : 0))
      .refine((v) => Number.isFinite(v) && v >= 0, "The discount is not a valid amount."),
    otherCharges: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : 0))
      .refine((v) => Number.isFinite(v) && v >= 0, "That charge is not a valid amount."),
    exchangeRate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v >= 100 && v <= 100_000),
        "That rate looks wrong for USD→TZS. Check the number of digits."
      ),
    notes: z.string().trim().optional(),
    /// "The cargo weighs something else now." Runs the rate book again against
    /// the shipment's current weight instead of keeping the figure the bill
    /// was raised with. A checkbox, so it is a thing somebody asked for.
    repriceFromWeight: z
      .string()
      .trim()
      .optional()
      .transform((v) => v === "on" || v === "true"),
    /// Required only when money has already landed against the bill. A
    /// correction to a settled figure has to say what was wrong with it.
    correctionReason: z.string().trim().optional(),
    freightOverride: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v >= 0),
        "That freight amount is not valid."
      ),
    freightOverrideReason: z.string().trim().optional(),
    /**
     * The storage charge, as Finance decides it should stand.
     *
     * The clock works the figure out — days past the free week times the daily
     * rate — but the owner asked for full flexibility at the counter: charge
     * it, reduce it, or waive it entirely. So this is what Finance says the
     * charge IS, and 0 is a waiver rather than a missing value.
     *
     * Absent means leave it alone, which is what almost every other edit to an
     * invoice does.
     */
    storageCharge: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v >= 0),
        "That storage amount is not valid."
      ),
    /// Required whenever the storage charge is moved off what the clock says.
    storageReason: z.string().trim().optional(),
  });

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          freightCost: true,
          freightOverride: true,
          storageCharge: true,
          storageWaivedUsd: true,
          storageWaiveReason: true,
          otherCharges: true,
          discount: true,
          amountPaid: true,
          /* Read so the correction can carry the status with the total; a
             cancelled or written-off bill is left as it is. */
          status: true,
          /* Whose money may settle this, and in what — the deposit below needs
             both, the same three columns confirmInvoicePrice reads. */
          customerId: true,
          currency: true,
          total: true,
          exchangeRate: true,
          localCurrency: true,
          notes: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              cargoCategory: true,
              cargoTypeId: true,
              weightKg: true,
              packages: true,
            },
          },
        },
      });
      if (!invoice) throw new Error("That invoice no longer exists.");

      /*
        A bill money has landed against can still be corrected — carefully.

        The old rule refused outright, which is safe and wrong: a customer who
        was billed the wrong amount and paid it is exactly the case Finance
        most needs to fix, and refusing only pushes the correction into a
        conversation nobody writes down.

        Three conditions instead of a wall. It takes ledger.adjust, because
        restating a figure money has moved against is the same act as
        restating the ledger. It takes a written reason. And it cannot take the
        total below what has already been paid — that is not a correction, it
        is a refund, and a refund is money leaving an account rather than a
        number being edited.
      */
      const alreadyPaid = toNumber(invoice.amountPaid);
      const correcting = alreadyPaid > 0;

      if (correcting) {
        if (!can(user.role, "ledger.adjust")) {
          throw new Error(
            `Money has already been received against ${invoice.invoiceNumber}, so correcting it needs someone who may adjust the ledger.`
          );
        }
        if (!input.correctionReason || input.correctionReason.length < 3) {
          throw new Error(
            `Say what was wrong with ${invoice.invoiceNumber}. A bill that has been paid is not changed without a reason.`
          );
        }
      }

      const discountChanged = input.discount !== toNumber(invoice.discount);
      if (discountChanged && !can(user.role, "invoice.discount")) {
        throw new Error("You are not authorised to change the discount on an invoice.");
      }

      // The rate-book figure stays in freightCost, untouched. Overriding it is
      // a departure that has to be explained, or in three months nobody can say
      // why this consignment was billed differently from the price list.
      const rateBookFreight = toNumber(invoice.freightCost);
      const previousOverride =
        invoice.freightOverride === null
          ? null
          : toNumber(invoice.freightOverride);
      const overrideChanged = input.freightOverride !== previousOverride;

      if (overrideChanged && input.freightOverride !== null) {
        if (!can(user.role, "invoice.discount")) {
          throw new Error(
            "You are not authorised to change the freight amount on an invoice."
          );
        }
        if (!input.freightOverrideReason) {
          throw new Error("Say why the freight amount is being changed.");
        }
      }

      /*
        RE-PRICE FROM WHAT THE CARGO ACTUALLY WEIGHS.

        The bill is raised at Dar check-in from the weight on the scale, but a
        consignment gets re-weighed — a box missed off the count, a figure typed
        wrong — and until now the bill kept the freight it was first given.
        Somebody then worked out the new figure by hand and typed it in as an
        override, which records a deliberate departure from the rate book for
        something that is not one.

        Asked for, never automatic: re-running the rate book also picks up any
        price the owner has published since, and a bill must not move because
        somebody edited its notes.
      */
      let rateBookFreightNow = rateBookFreight;
      if (input.repriceFromWeight) {
        const repriced = await quote({
          category: invoice.shipment.cargoCategory,
          cargoTypeId: invoice.shipment.cargoTypeId,
          weightKg: toNumber(invoice.shipment.weightKg),
          quantity: invoice.shipment.packages,
        });
        if (!repriced.ok) {
          throw new Error(
            `${invoice.shipment.trackingNumber} cannot be re-priced from the rate book.`
          );
        }
        rateBookFreightNow = repriced.total;
      }

      const freight = input.freightOverride ?? rateBookFreightNow;
      /*
        Storage: the clock proposes, Finance decides.

        Waiving or reducing it is a real decision about real money, so it is
        not allowed to be silent — the reason is required the moment the figure
        moves off what the days say, and it lands in the audit log with who
        made it. Charging the full amount needs no explanation, because that is
        simply the policy the customer was told about.
      */
      const clockStorage = toNumber(invoice.storageCharge);
      const alreadyWaived = toNumber(invoice.storageWaivedUsd);
      const storage = input.storageCharge ?? clockStorage;
      const storageMoved = Math.abs(storage - clockStorage) > 0.005;
      if (storageMoved && (!input.storageReason || input.storageReason.length < 3)) {
        throw new Error(
          storage === 0
            ? "Say why the storage charge is being waived."
            : "Say why the storage charge is being changed."
        );
      }

      /*
        This edit and the storage card are two doors onto the same money, so
        they have to leave the record in the same state.

        Zeroing the charge here IS a waiver, and has to be written as one: the
        forgiven figure kept, with a name and a reason against it. Otherwise it
        vanishes — indistinguishable from storage that never accrued, invisible
        in the storage report, and nobody can answer why a twelve-day
        consignment was not charged.

        Putting a charge back on reverses an earlier waiver, so the waiver has
        to be cleared. Leaving it would show "waived" and "on the bill" at the
        same time and count the same dollars twice in reporting.
      */
      const waiverEdit =
        /* Zeroing a live charge IS a waiver — write it as one. */
        storage === 0 && clockStorage > 0
          ? {
              storageWaivedUsd: new Prisma.Decimal(clockStorage),
              storageWaivedAt: new Date(),
              storageWaivedById: user.id,
              storageWaiveReason:
                input.storageReason || "Waived when the invoice was adjusted.",
            }
          : /* Putting a charge back reverses an earlier waiver — clear it. */
            storage > 0 && alreadyWaived > 0
            ? {
                storageWaivedUsd: new Prisma.Decimal(0),
                storageWaivedAt: null,
                storageWaivedById: null,
                storageWaiveReason: null,
              }
            : /* Everything else leaves the existing waiver, and whoever made
                 it, exactly as it stands. An edit to the discount must not
                 re-stamp last week's waiver with today's date and my name. */
              {};

      const total = freight + storage + input.otherCharges - input.discount;
      if (total < 0) {
        throw new Error("The discount is larger than the rest of the invoice.");
      }

      /*
        A correction cannot turn into a refund by arithmetic.

        Dropping the total below what the customer has already handed over
        would leave the invoice owing them money, with no record of that money
        going back and no account it left from. That is a real thing that
        happens — it is just not an edit.
      */
      if (correcting && total < alreadyPaid) {
        throw new Error(
          `${invoice.invoiceNumber} has ${alreadyPaid.toFixed(2)} paid against it, so it cannot be corrected to ${total.toFixed(2)}. Refunding the difference is a payment out, not a change to the bill.`
        );
      }

      // The rate is Finance's, like the discount above it. Support prepares
      // and sends the bill, but moving the USD→TZS rate on one invoice changes
      // what the customer owes just as surely as a discount does, and the
      // owner puts both on the Finance side of the line. Enforced here rather
      // than only in the form: the action is reachable without it.
      const currentRate =
        invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
      if (
        input.exchangeRate !== null &&
        input.exchangeRate !== currentRate &&
        !can(user.role, "invoice.rate")
      ) {
        throw new Error(
          "You are not authorised to change the exchange rate on an invoice."
        );
      }

      /* An older bill may carry none at all. Filling it in is not a re-quote —
         the dollar total is untouched — it is giving a bill the shilling figure
         it should always have had, so the counter can take shillings for it. */
      const rate = input.exchangeRate ?? currentRate ?? (await billingRate(new Date()));
      const totalLocal = rate === null ? null : toLocal(total, rate);

      /* The write only lands if amountPaid is still what the guard above
         tested. A payment committing in between would otherwise slip the new
         total below what the customer has now paid — the exact state the
         guard exists to refuse. */
      const adjusted = await tx.invoice.updateMany({
        where: { id: invoice.id, amountPaid: invoice.amountPaid },
        data: {
          discount: new Prisma.Decimal(input.discount),
          otherCharges: new Prisma.Decimal(input.otherCharges),
          freightOverride:
            input.freightOverride === null
              ? null
              : new Prisma.Decimal(input.freightOverride),
          freightOverrideReason: input.freightOverride === null
            ? null
            : input.freightOverrideReason || null,
          storageCharge: new Prisma.Decimal(storage),
          ...waiverEdit,
          total: new Prisma.Decimal(total),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          localCurrency: invoice.localCurrency ?? LOCAL_CURRENCY,
          totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
          notes: input.notes || null,
          /*
            THE STATUS FOLLOWS THE TOTAL.

            Without this a bill corrected upward stayed PAID with the new money
            owed on it — absent from every receivables read, so nobody chased
            it — and a bill corrected down to exactly what had been paid stayed
            PARTIALLY_PAID, which the pickup gate reads, so cargo could not be
            released for a bill that was settled. The storage card next door
            has always done this; both doors move the same total, and now both
            derive the state the same way. See lib/invoice-status.ts.
          */
          ...(() => {
            const next = invoiceStatusFor(invoice.status, alreadyPaid, total);
            return next === null ? {} : { status: next };
          })(),
        },
      });
      if (adjusted.count === 0) {
        throw new Error(
          "A payment landed on this bill a moment ago. Reload and adjust it against the fresh balance."
        );
      }

      /*
        AND THE DEPOSIT FOLLOWS THE CORRECTION.

        The cargo was heavier than the packing list said, so the bill went up —
        and the customer had already paid a deposit that covered the old figure
        and more. Without this, the difference sits as credit on their account
        while the bill reads unpaid and the cargo stays in the warehouse, and
        somebody has to notice and apply it by hand.

        Whatever the correction did, this puts the customer's own money against
        it. Nothing is applied if there is none spare, and nothing is taken
        back if the bill went down — money already against a bill is a
        settlement, not a running balance.
      */
      /*
        NOT AGAINST A DRAFT.

        A draft is the system's own price before Finance has agreed it, and
        confirmInvoicePrice is where the deposit is applied — it says so in its
        own comment: taking money against a price nobody has looked at is the
        thing the confirm step exists to prevent. Applying it here would also
        leave the bill unable to say it had been paid, because a draft's status
        is deliberately never rewritten by arithmetic; the money would land and
        the label would still read DRAFT.

        Correcting a draft is fine. The deposit follows a moment later, when
        somebody confirms the price.
      */
      const settledFromCredit =
        invoice.status === "DRAFT"
          ? 0
          : await applyCreditToInvoice(tx, {
              invoiceId: invoice.id,
              customerId: invoice.customerId,
              currency: invoice.currency,
              invoiceRate: rate,
              outstanding: total - alreadyPaid,
              user,
            });

      const paidAfter = alreadyPaid + settledFromCredit;
      if (settledFromCredit > 0.005) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: new Prisma.Decimal(paidAfter),
            status: invoiceStatusFor(invoice.status, paidAfter, total) ?? undefined,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "invoice.adjust",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${correcting ? "Corrected" : "Adjusted"} ${invoice.invoiceNumber} (${invoice.shipment.trackingNumber}) ` +
            `from ${toNumber(invoice.total).toFixed(2)} to ${total.toFixed(2)}` +
            (discountChanged ? ` — discount ${input.discount.toFixed(2)}` : "") +
            /* A waived or reduced storage charge is money the business chose
               not to take. It is named in the summary rather than left to be
               inferred from two numbers in the metadata. */
            (storageMoved
              ? storage === 0
                ? ` — storage waived (${clockStorage.toFixed(2)}): ${input.storageReason}`
                : ` — storage ${clockStorage.toFixed(2)} to ${storage.toFixed(2)}: ${input.storageReason}`
              : "") +
            (correcting ? ` — ${input.correctionReason}` : ""),
          metadata: {
            // Named so a reader of the log can tell a routine adjustment from
            // a restatement of a bill somebody had already paid.
            correction: correcting,
            reason: correcting ? input.correctionReason : undefined,
            alreadyPaid: correcting ? alreadyPaid : undefined,
            totalBefore: toNumber(invoice.total),
            totalAfter: total,
            storageWaived: storageMoved && storage === 0 ? true : undefined,
            storageReason: storageMoved ? input.storageReason : undefined,
            before: {
              discount: toNumber(invoice.discount),
              storageCharge: clockStorage,
              otherCharges: toNumber(invoice.otherCharges),
              exchangeRate:
                invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate),
              notes: invoice.notes,
            },
            after: {
              discount: input.discount,
              storageCharge: storage,
              otherCharges: input.otherCharges,
              exchangeRate: rate,
              notes: input.notes ?? null,
            },
          },
        },
        tx
      );

      return { total, invoiceId: invoice.id };
    });

    revalidatePath("/app/finance/invoices");
    revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    return ok({ total: result.total });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Taking something off the bill, from wherever the desk is standing.
 *
 * Discounting is ordinary here — a customer negotiates at the counter and the
 * figure moves — and until now it meant leaving the payment, opening the
 * invoice, editing four fields and coming back. This does the one thing.
 *
 * THE TOTAL IS DERIVED FROM THE TOTAL, NOT RE-COMPUTED.
 *
 * adjustInvoice rebuilds the bill from freight, storage and charges, and
 * re-prices from the rate book on the way through. Repeating that arithmetic
 * here would be a second definition of what a bill comes to, and the two would
 * disagree the first time either changed. So this works from the stored total:
 * put back the discount that is on it, take off the new one. Whatever the
 * total was built from stays exactly as it was built.
 *
 * A discount can settle a bill outright — that is the point of it — so the
 * status follows the arithmetic through the same derivation everything else
 * uses. What it may never do is drop the total below what the customer has
 * already handed over: that is money owed BACK to them, which is a refund and
 * not a discount, and this refuses it rather than inventing one.
 */
export async function applyInvoiceDiscount(
  _prev: ActionResult<{ total: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ total: number }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("invoice.discount");
    const parsed = discountSchema.safeParse(
      Object.fromEntries(formData) as Record<string, string>
    );
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
    const input = parsed.data;

    /* One id, or several when a payment covers several bills. */
    const ids = input.invoiceId.split(",").map((v) => v.trim()).filter(Boolean);

    const result = await prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { id: { in: ids } },
        orderBy: { invoiceNumber: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          discount: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          localCurrency: true,
        },
      });
      if (invoices.length !== ids.length) {
        throw new Error("One of those bills no longer exists. Reload and try again.");
      }
      for (const invoice of invoices) {
        if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
          throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
        }
      }

      /*
        ONE DISCOUNT, SPLIT ACROSS THE BILLS IT COVERS — AND IT ADDS UP.

        The figure typed is the discount for the whole payment, because that is
        the conversation: "I'll take fifty thousand off". It has to land on the
        invoices, so it is shared out in proportion to what each is worth
        BEFORE any discount — the larger bill carries the larger share, which
        is the only split nobody has to argue about.

        The last bill takes the remainder rather than its own rounded share, so
        the parts sum to the figure agreed EXACTLY. Rounding each independently
        loses or invents a cent, and a cent that came from nowhere is the thing
        this system exists not to do.
      */
      const gross = invoices.map((i) => toNumber(i.total) + toNumber(i.discount));
      const basis = gross.reduce((n, g) => n + g, 0);
      if (basis <= 0) {
        throw new Error("There is nothing on these bills to discount.");
      }

      /*
        THE FIGURE MAY HAVE BEEN AGREED IN SHILLINGS.

        The counter says "punguza elfu tano" and the bill is written in
        dollars; the box only ever accepted dollars, so the desk was doing
        that division in its head and typing the result. Now the figure comes
        with the money it was typed in and the conversion happens here.

        Each bill converts at the rate frozen onto IT, not at one rate for the
        batch: two consignments billed a fortnight apart were quoted at the
        two rates published on those days, and both are right. So the shilling
        figure is shared out in shillings first, then each share is turned
        into that bill's own currency.
      */
      const typedInLocal = input.discountIn === "local";
      const rateOf = (invoice: (typeof invoices)[number]) => {
        if (invoice.currency === (invoice.localCurrency ?? "TZS")) return 1;
        return invoice.exchangeRate === null ? 0 : toNumber(invoice.exchangeRate);
      };
      if (typedInLocal) {
        for (const invoice of invoices) {
          if (rateOf(invoice) <= 0) {
            throw new Error(
              `${invoice.invoiceNumber} has no exchange rate on it, so a shilling discount cannot be worked out. Give the figure in ${invoice.currency}, or set the rate on the bill first.`
            );
          }
        }
      }

      /* Shared out in proportion to what each bill is worth IN THE MONEY THE
         FIGURE WAS TYPED IN, so the parts of a shilling discount add up to
         the shillings that were agreed. */
      const weights = typedInLocal
        ? invoices.map((invoice, idx) => gross[idx]! * rateOf(invoice))
        : gross;
      const weighed = weights.reduce((n, g) => n + g, 0);

      let handedOut = 0;
      const shares = invoices.map((invoice, idx) => {
        const last = idx === invoices.length - 1;
        const raw = last
          ? input.discount - handedOut
          : (input.discount * weights[idx]!) / weighed;
        /* Rounded in the money it was typed in — shillings are never quoted
           to the cent — and only then converted onto the bill. */
        const share = typedInLocal
          ? Math.round(raw)
          : Math.round(raw * 100) / 100;
        handedOut += share;
        return typedInLocal
          ? Math.round((share / rateOf(invoice)) * 100) / 100
          : share;
      });

      const changed: { number: string; was: number; now: number; total: number }[] = [];

      for (const [idx, invoice] of invoices.entries()) {
        const wasDiscount = toNumber(invoice.discount);
        const paid = toNumber(invoice.amountPaid);
        const share = shares[idx]!;
        const total = gross[idx]! - share;

        if (total < 0) {
          throw new Error("That discount is larger than the rest of the bill.");
        }
        if (total < paid - 0.005) {
          throw new Error(
            `${invoice.invoiceNumber} has ${invoice.currency} ${paid.toFixed(2)} paid against it, so it cannot be discounted to ${total.toFixed(2)}. Handing the difference back is a refund, not a discount.`
          );
        }

        const rate =
          invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
        const nextStatus = invoiceStatusFor(invoice.status, paid, total);

        /* The claim: both the balance and the discount have to be what this
           transaction read, so two people discounting at once cannot stack.
           A throw here unwinds every bill in this batch. */
        const claimed = await tx.invoice.updateMany({
          where: {
            id: invoice.id,
            amountPaid: invoice.amountPaid,
            discount: invoice.discount,
          },
          data: {
            discount: new Prisma.Decimal(share),
            total: new Prisma.Decimal(total),
            totalLocal:
              rate === null ? null : new Prisma.Decimal(toLocal(total, rate)),
            ...(nextStatus ? { status: nextStatus } : {}),
          },
        });
        if (claimed.count === 0) {
          throw new Error(
            "This bill changed a moment ago. Reload the page and look again."
          );
        }

        await recordAudit(
          {
            actor: user,
            action: "invoice.discount",
            entity: "Invoice",
            entityId: invoice.id,
            summary:
              `${invoice.invoiceNumber}: discount ${wasDiscount.toFixed(2)} → ` +
              `${share.toFixed(2)} ${invoice.currency}, bill now ` +
              `${total.toFixed(2)}` +
              (invoices.length > 1
                ? ` (its share of ${input.discount.toFixed(2)} across ${invoices.length} bills)`
                : "") +
              ` — ${input.reason}`,
            metadata: {
              discountBefore: wasDiscount,
              discountAfter: share,
              totalBefore: toNumber(invoice.total),
              totalAfter: total,
              amountPaid: paid,
              statusBefore: invoice.status,
              statusAfter: nextStatus ?? invoice.status,
              acrossBills: invoices.length,
              discountAcrossAll: input.discount,
              reason: input.reason,
            },
          },
          tx
        );

        changed.push({
          number: invoice.invoiceNumber,
          was: wasDiscount,
          now: share,
          total,
        });
      }

      return {
        total: changed.reduce((n, c) => n + c.total, 0),
        invoiceId: invoices[0]!.id,
      };
    });

    revalidatePath("/app/finance/invoices");
    revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/cargo");
    return ok({ total: result.total });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Re-quoting ONE bill at a different rate.
 *
 * The rate on an invoice is frozen the day it is raised, and that is right:
 * publishing a new rate tomorrow must not restate what a customer was already
 * told. But a bill raised weeks ago and settled today at a rate the counter
 * agreed is a real conversation, and whatever they agree has to be the number
 * in the books — for this consignment and no other.
 *
 * The DOLLAR total does not move. Freight was priced in dollars and stays
 * priced in dollars; what changes is the shilling figure that dollar total
 * converts to, which is the only thing a rate decides. Nothing about what has
 * already been paid is touched either: an earlier payment settled at the rate
 * agreed on its own day, and its receipt says so.
 *
 * invoice.rate, which is NOT fx.manage: fx.manage publishes the company's own
 * rate and prices every bill raised after it, and that stays with Finance.
 * This is the narrow thing — one bill, settled today at a figure agreed with
 * the customer — and the desk on the phone holds it. Audited with a reason
 * either way, because it still moves what somebody owes.
 */
export async function changeInvoiceRate(
  _prev: ActionResult<{ totalLocal: number | null }> | undefined,
  formData: FormData
): Promise<ActionResult<{ totalLocal: number | null }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("invoice.rate");
    const parsed = invoiceRateSchema.safeParse(
      Object.fromEntries(formData) as Record<string, string>
    );
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
    const input = parsed.data;

    /* One id, or several when a payment covers several bills. Unlike the
       discount there is nothing to share out — a rate is a rate, and each
       bill's own dollar total converts at it. */
    const ids = input.invoiceId.split(",").map((v) => v.trim()).filter(Boolean);

    const result = await prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { id: { in: ids } },
        orderBy: { invoiceNumber: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          exchangeRate: true,
          localCurrency: true,
        },
      });
      if (invoices.length !== ids.length) {
        throw new Error("One of those bills no longer exists. Reload and try again.");
      }

      let lastLocal = 0;
      for (const invoice of invoices) {
      if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
        throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
      }

      const was = invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
      const total = toNumber(invoice.total);
      const totalLocal = toLocal(total, input.exchangeRate);
      lastLocal = totalLocal;

      /* Claimed on the rate this transaction read, so two people re-quoting at
         once cannot leave the bill on a figure neither of them chose. A throw
         here unwinds every bill in this batch. */
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, exchangeRate: invoice.exchangeRate },
        data: {
          exchangeRate: new Prisma.Decimal(input.exchangeRate),
          localCurrency: invoice.localCurrency ?? LOCAL_CURRENCY,
          totalLocal: new Prisma.Decimal(totalLocal),
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          "This bill changed a moment ago. Reload the page and look again."
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "invoice.rate",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${invoice.invoiceNumber}: rate ${was === null ? "none" : was.toLocaleString()} → ` +
            `${input.exchangeRate.toLocaleString()}, ${invoice.currency} ${total.toFixed(2)} ` +
            `now ${Math.round(totalLocal).toLocaleString()} — ${input.reason}`,
          metadata: {
            rateBefore: was,
            rateAfter: input.exchangeRate,
            total,
            totalLocalBefore:
              was === null ? null : Math.round(toLocal(total, was)),
            totalLocalAfter: Math.round(totalLocal),
            reason: input.reason,
          },
        },
        tx
      );

      }

      return { totalLocal: lastLocal, invoiceId: invoices[0]!.id };
    });

    revalidatePath("/app/finance/invoices");
    revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/cargo");
    return ok({ totalLocal: result.totalLocal });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Records money received and issues its receipt in the same transaction —
 * a payment without a receipt number is not a payment we can defend.
 */
export async function recordPayment(
  _prev:
    | ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>
    | undefined,
  formData: FormData
): Promise<
  ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>
> {
  let user: SessionUser;
  try {
    user = await authorize("payment.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  /* Read before the schema parse: it is not part of what a payment IS, it is
     how this request identifies itself. See lib/idempotency.ts. */
  const idempotencyKey = idempotencyKeyFrom(formData);

  const __raw = Object.fromEntries(formData) as Record<string, unknown>;
  console.error("PROBE recordPayment keys", JSON.stringify(Object.keys(__raw)), "transport=", JSON.stringify(__raw.transport), "typeof", typeof __raw.transport);
  const parsed = paymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  console.error("PROBE parse ok?", parsed.success, parsed.success ? JSON.stringify({transport: parsed.data.transport}) : JSON.stringify(parsed.error.issues));
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  let issuedNote: string | null = null;

  // Uploaded before the transaction opens. A file crossing the network must
  // not hold a row lock on an invoice, and a proof that fails to store must
  // fail the whole thing loudly rather than leaving a payment recorded with
  // evidence nobody can find.
  let proofs: { url: string; contentType: string; bytes: number; filename: string }[];
  try {
    const files = filesFrom(formData, "proof");
    proofs = await Promise.all(
      files.map(async (file) => {
        const stored = await putDocument(file, "proof");
        return { ...stored, filename: file.name || "proof" };
      })
    );
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const receiptNumber = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          status: true,
          currency: true,
          exchangeRate: true,
          issuedAt: true,
          /* The payer, carried onto the payment: money that arrives ahead of a
             bill, or beyond every bill, still belongs to somebody. */
          customerId: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              batchId: true,
              /* Where the boxes are. Money may not be taken for cargo the Dar
                 floor has not confirmed — see lib/payable.ts. */
              status: true,
            },
          },
        },
      });
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status === "VOID") throw new Error("This invoice is void.");
      if (invoice.status === "WRITTEN_OFF") {
        throw new Error(
          `${invoice.invoiceNumber} was written off when its batch was closed. Reopen the batch to take money against it.`
        );
      }
      // Without this the confirm step would be decorative: a clerk could take
      // money against a price nobody in Finance had looked at.
      if (invoice.status === "DRAFT") {
        throw new Error(
          `${invoice.invoiceNumber} is still a draft. Confirm the price before recording a payment against it.`
        );
      }
      /*
        And where the cargo is, not only what the bill says.

        confirmInvoicePrice will not lift a draft on cargo Dar has not
        confirmed, so a bill in this state is either older than that rule or
        belongs to a consignment that has since been sent back out. Either way
        this endpoint is reachable without the screen, so it asks for itself.
      */
      if (!isCollectable(invoice.shipment.status)) {
        throw new Error(notPayableMessage(invoice.shipment.trackingNumber));
      }

      /*
        ONE REAL PAYMENT = ONE PAYMENT RECORD.

        Support collects a customer's proof at the counter and sends it up; it
        is not money until Finance agrees, so the bill still reads as owing and
        this form still offers the full balance pre-filled. Finance then opens
        the cargo, sees a balance, and records the same money a second time —
        two payments, two receipts, two ledger lines, one customer's shillings.
        The notice above the form has warned about this for months, and a
        warning is not a control: the desk that is busy is exactly the desk that
        does not read it.

        The submission is claimed through its own door instead, which posts the
        ledger line itself. The message says so, because "refused" without the
        next step just moves the problem to WhatsApp.
      */
      const pending = await tx.paymentSubmission.findFirst({
        /* Including a MERGED claim that covers this bill among others — see
           pendingClaimWhere. Asking only about claims raised against this
           invoice let the other consignments in a merge be paid twice. */
        where: pendingClaimWhere(invoice.id),
        orderBy: { submittedAt: "asc" },
        select: {
          submissionNumber: true,
          amount: true,
          currency: true,
          submittedBy: { select: { name: true } },
        },
      });
      if (pending) {
        const who = pending.submittedBy?.name ?? "Customer Support";
        throw new Error(
          `${who} has already recorded this payment (${pending.submissionNumber}, ` +
            `${pending.currency} ${toNumber(pending.amount).toLocaleString()}) and it is ` +
            `waiting for you to verify it. Verify that one in Finance → Verify payments ` +
            `— recording it here as well would take the same money twice.`
        );
      }

      // Money cannot arrive before the bill exists. The form already refuses a
      // future date; this is the other end of the same sanity check, and it is
      // what catches a mis-scrolled year on a date picker.
      if (input.paidAt && input.paidAt < startOfDay(invoice.issuedAt)) {
        throw new Error(
          `${invoice.invoiceNumber} was only raised on ${invoice.issuedAt.toLocaleDateString("en-GB")}. A payment cannot be dated before that.`
        );
      }

      const total = toNumber(invoice.total);
      const paid = toNumber(invoice.amountPaid);
      const outstanding = total - paid;

      if (outstanding <= 0) throw new Error("This invoice is already settled.");

      // What the customer handed over, and what it is worth against this bill.
      //
      // A USD invoice settled in shillings converts at the rate frozen onto
      // that invoice, never at today's — otherwise the same bill would settle
      // for a different amount depending on the day it was paid, and the
      // customer was quoted the frozen one.
      const tenderedCurrency = input.currency ?? invoice.currency;
      const invoiceRate =
        invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);

      /*
        WHAT THE CUSTOMER SENT, AND WHAT OF IT WAS THE COMPANY'S.

        `input.amount` is the whole figure handed over and stays that way on
        the payment and the receipt. The transport half was never the
        company's — it goes on to whoever drives — so only the cargo half is
        converted, compared against the bill and credited to it. A customer
        who sends 100,000 against an 80,000 bill with 20,000 of transport has
        paid in full and owes nothing, which is the whole point.
      */
      const transport = input.transport ?? 0;
      if (transport > input.amount + 0.001) {
        throw new Error(
          `Transport of ${transport.toLocaleString()} is more than the ${input.amount.toLocaleString()} that came in.`
        );
      }
      const cargoTendered = Math.round((input.amount - transport) * 100) / 100;
      /*
        THE FARE IS MEASURED AGAINST THE CARGO, NOT AGAINST THE TOTAL.

        This guard used to read "the fare cannot exceed what came in". That
        sentence was true when the desk typed the whole transfer and the fare
        was carved out of it. The screens now do the arithmetic the other way
        round — the total is the bill plus the fare, because that is what the
        customer actually hands over — and against THAT total the old test is
        an identity: the fare is always smaller, so it could never refuse
        anything again.

        An extra nought on a 10,000 fare would then settle the bill correctly,
        issue the pickup note, and quietly post 100,000 out of the cash tin,
        with nothing on any screen or server saying a word.

        So it is compared to the half that actually settles the bill, which is
        where a mistyped fare stands out. A delivery really can cost more than
        a small consignment's freight, so this is a question and not a wall:
        the desk ticks to say it is right, and that tick travels here.
      */
      if (transport > cargoTendered + 0.001 && !input.transportConfirmed) {
        throw new Error(
          `The transport (${transport.toLocaleString()}) is more than the ${cargoTendered.toLocaleString()} going to the bill. ` +
            `Check the figure — if it is right, tick to confirm it.`
        );
      }

      let credited = cargoTendered;
      let rateUsed: number | null = null;

      if (tenderedCurrency !== invoice.currency) {
        // The rate the desk agreed, or the one frozen onto the invoice when
        // they did not touch it. Never today's published rate silently: the
        // customer was quoted a figure and a rate that moves under them
        // without anybody saying so is how a bill gets argued about.
        const agreedRate = input.exchangeRate ?? invoiceRate;
        if (agreedRate === null) {
          throw new Error(
            `${invoice.invoiceNumber} carries no exchange rate, so a payment in ${tenderedCurrency} cannot be converted. Set one on this payment, or publish a rate and regenerate the invoice.`
          );
        }
        rateUsed = agreedRate;
        // Both directions, so this keeps working if an invoice is ever raised
        // in shillings.
        credited =
          tenderedCurrency === LOCAL_CURRENCY
            ? cargoTendered / rateUsed
            : cargoTendered * rateUsed;
        // Round to the cent the invoice is denominated in, or a payment meant
        // to settle a bill exactly leaves a fraction behind and the pickup
        // note never unlocks.
        credited = Math.round(credited * 100) / 100;
      }

      // Overpayment is almost always a typo at the counter. Reject it rather
      // than quietly creating a credit the system has no concept of.
      if (credited > outstanding + 0.001) {
        throw new Error(
          tenderedCurrency === invoice.currency
            ? `That is more than the ${invoice.currency} ${outstanding.toLocaleString()} still outstanding.`
            : `${tenderedCurrency} ${cargoTendered.toLocaleString()} of cargo is ${invoice.currency} ${credited.toLocaleString()} at this invoice's rate — more than the ${invoice.currency} ${outstanding.toLocaleString()} still outstanding.`
        );
      }

      /*
        WHERE THE TRANSPORT HALF IS SETTLED FROM.

        Required as soon as there is any, because a transport amount with
        nowhere to come from is money that left no account — the register
        would balance and the till would not. Deliberately not forced to match
        the account the customer paid into: they can pay by bank while the
        driver is handed cash.
      */
      let transportAccount: {
        id: string;
        name: string;
        currency: string;
        kind: string;
      } | null = null;
      if (transport > 0) {
        if (!input.transportSourceId) {
          throw new Error(
            "Say which account the transport is settled from — the cash box or the Lipa number."
          );
        }
        transportAccount = await tx.companyAccount.findUnique({
          where: { id: input.transportSourceId },
          select: { id: true, name: true, currency: true, kind: true },
        });
        if (!transportAccount) {
          throw new Error("That transport account no longer exists.");
        }
        /*
          THE TILL OR THE LIPA NUMBER, AND NOTHING ELSE.

          The customer may send the whole amount into any account the company
          holds — bank included — because that is their choice and the money
          has to be recorded where it actually landed. Paying the driver is
          the company's own business and happens in cash or off the Lipa
          number; a bank account is not something anybody hands a driver from.

          Enforced here rather than only in the dropdown, because this action
          is a public endpoint and the two must not be able to disagree.
        */
        if (
          transportAccount.kind !== "CASH" &&
          transportAccount.kind !== "MOBILE_MONEY"
        ) {
          throw new Error(
            `Transport is settled in cash or off the Lipa number. ${transportAccount.name} is a bank account.`
          );
        }
        /* The same refusal the receiving account makes: an account can only
           give up money it is denominated in. */
        if (transportAccount.currency !== tenderedCurrency) {
          throw new Error(
            `${transportAccount.name} is a ${transportAccount.currency} account, so ${tenderedCurrency} transport cannot be settled from it.`
          );
        }
      }

      // Where the money landed, if the desk said. Optional by design — see
      // paymentSchema — but if an account IS named it has to be able to hold
      // this money: shillings do not go into a dollar account, and an account
      // that quietly accepts the wrong currency is how a balance stops meaning
      // anything.
      let account: {
        id: string;
        name: string;
        kind: AccountKind;
        currency: string;
        active: boolean;
      } | null = null;
      if (input.accountId) {
        account = await tx.companyAccount.findUnique({
          where: { id: input.accountId },
          /* kind, because the stored method is read off the account now —
             see methodForKind. */
          select: {
            id: true,
            name: true,
            kind: true,
            currency: true,
            active: true,
          },
        });
        if (!account) throw new Error("That account no longer exists.");
        if (!account.active) {
          throw new Error(
            `${account.name} has been archived, so no new money can be recorded against it.`
          );
        }
        if (account.currency !== tenderedCurrency) {
          throw new Error(
            `${account.name} is a ${account.currency} account, so a payment of ${tenderedCurrency} ${input.amount.toLocaleString()} cannot have landed in it. Pick the account the money actually went to.`
          );
        }
      }

      /*
        THE SAME PAYMENT, TWICE, FROM ONE PAIR OF HANDS.

        The conditional claim further down catches two clerks racing each other,
        because they read the same amountPaid. It cannot catch one clerk whose
        first submission SUCCEEDED — a double-tapped button, or a page refreshed
        while the spinner was up — because the second attempt reads the new
        figure and is arithmetically fine. On a bill settled in full the
        outstanding check stops it; on a part payment nothing did.

        So the same amount, in the same currency, by the same method, against
        the same bill, within two minutes, is treated as the same money. A
        customer genuinely paying twice inside two minutes types a reference or
        waits — and is a great deal rarer than a warehouse phone on a bad
        connection.
      */
      const echo = await tx.payment.findFirst({
        where: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(input.amount),
          currency: tenderedCurrency,
          /* Keyed on the account rather than the method it used to be keyed
             on. Strictly narrower: two accounts of the same kind were one key
             before, so a customer paying the same figure into CRDB and into
             TCB inside two minutes could be refused as a double submission. */
          accountId: input.accountId,
          reference: input.reference || null,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        select: { receipt: { select: { receiptNumber: true } } },
      });
      if (echo) {
        throw new Error(
          `This payment has just been recorded${
            echo.receipt ? ` on receipt ${echo.receipt.receiptNumber}` : ""
          }. Reload the page — recording it again would take the same money twice.`
        );
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          amount: new Prisma.Decimal(input.amount),
          currency: tenderedCurrency,
          creditedAmount: new Prisma.Decimal(credited),
          exchangeRate: rateUsed === null ? null : new Prisma.Decimal(rateUsed),
          /* The database's own answer to a double submission — see
             lib/idempotency.ts. The findFirst above catches the ordinary case;
             this catches the one it cannot, two requests at the same instant. */
          idempotencyKey,
          method: methodForKind(mustHaveAccount(account).kind),
          reference: input.reference || null,
          note: input.note || null,
          accountId: mustHaveAccount(account).id,
          /* Recorded on the payment, not derived from the gap between what
             came in and what the bill took — a payment can legitimately
             overpay a bill, and the two must never be confused. */
          transportAmount: new Prisma.Decimal(transport),
          transportSourceId: transport > 0 ? transportAccount!.id : null,
          // Defaults to now in the schema when the desk leaves it blank.
          ...(input.paidAt ? { paidAt: input.paidAt } : {}),
          receivedById: user.id,
          proofs: {
            create: proofs.map((proof) => ({
              url: proof.url,
              contentType: proof.contentType,
              bytes: proof.bytes,
              filename: proof.filename,
              uploadedById: user.id,
            })),
          },
        },
      });

      /*
        WHAT THIS PAYMENT SETTLED, written as its own record.
        One allocation today, because this form still takes one bill at a time.
        It moves no money — the payment above already did that, once — it only
        says which bill this share answered, which is what lets a later transfer
        answer three bills without becoming three payments. `credited` and not
        `input.amount`: a bill is settled in its own currency.
      */
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(credited),
          createdById: user.id,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          receiptNumber: await nextReceiptNumber(tx),
          paymentId: payment.id,
          issuedById: user.id,
        },
      });

      // The ledger line, in the same transaction as the payment and its
      // receipt — the pattern already used to guarantee a payment cannot exist
      // without its document. Here it guarantees money cannot enter an account
      // without a line saying so.
      //
      // Nothing about the clerk's flow changes: no extra click, no extra
      // screen, and if they named no account there is simply no line to write
      // yet. This is bookkeeping following the work, not standing in front of
      // it.
      if (account) {
        // The line is written in the ACCOUNT's currency, which is what a bank
        // statement will say. A USD figure travels beside it so totals can
        // cross accounts of different currencies — the same discipline as
        // creditedAmount, and for the same reason.
        //
        // THE WHOLE TRANSFER, RESTATED — NOT THE CARGO HALF.
        //
        // This used to take `credited` whenever the bill was in dollars, on
        // the grounds that credited IS the payment restated. That stopped
        // being true the day a payment could carry transport: credited is the
        // cargo half, while `amount` on this very line is the whole lump. The
        // row contradicted itself — TSh 46,450 in, worth USD 13.50 — and
        // since the TRANSPORT_OUT leg beside it is valued honestly, every
        // account total in dollars drifted DOWN by the fare on each one.
        //
        // Restated at the rate this payment settled at, so the two legs and
        // the credited figure all speak about the same money at the same rate.
        const usdRate = rateUsed ?? invoiceRate;
        const usdValue =
          tenderedCurrency === "USD"
            ? input.amount
            : usdRate
              ? input.amount / usdRate
              : input.amount;

        await postLedgerEntry(tx, {
          accountId: account.id,
          currency: account.currency,
          direction: "IN",
          kind: "CUSTOMER_PAYMENT",
          amount: input.amount,
          amountUsd: usdValue,
          exchangeRate: rateUsed,
          occurredAt: input.paidAt ?? payment.paidAt,
          /*
            THE ONE LUMP, AND HOW IT WAS SEPARATED, ON THE ROW ITSELF.

            The customer's proof shows a single figure. The register shows
            that figure arriving and, on another account, part of it leaving
            again — and nothing tied the two together for somebody scrolling
            the ledger. Saying the split here means the row can be read
            against the screenshot without opening the payment.
          */
          description:
            `${receipt.receiptNumber} — ${invoice.invoiceNumber} for ${invoice.shipment.trackingNumber}` +
            (transport > 0
              ? ` (${cargoTendered.toLocaleString()} cargo + ${transport.toLocaleString()} transport)`
              : ""),
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: user.id,
        });
      }

      /*
        THE TRANSPORT, GOING BACK OUT.

        The customer's whole 100,000 landed in the account above — that is the
        IN leg and it says what they sent. This is the 20,000 of it that was
        never the company's, leaving whichever account the desk named, on its
        way to whoever drives.

        Its own kind, TRANSPORT_OUT, so it is never mistaken for income, for
        an expense, or for a customer payment being netted off in
        reconciliation. Its own leg, so the account it left is the account the
        register shows it leaving.

        Written even when the customer's own account was not named — the two
        are independent decisions, and transport that left the till is a fact
        whether or not the desk said where the money arrived.
      */
      if (transport > 0 && transportAccount) {
        const transportUsd =
          tenderedCurrency === "USD"
            ? transport
            : rateUsed ?? invoiceRate
              ? transport / (rateUsed ?? invoiceRate)!
              : transport;

        await postLedgerEntry(tx, {
          accountId: transportAccount.id,
          currency: transportAccount.currency,
          direction: "OUT",
          kind: "TRANSPORT_OUT",
          amount: transport,
          amountUsd: transportUsd,
          exchangeRate: rateUsed,
          occurredAt: input.paidAt ?? payment.paidAt,
          description: `${receipt.receiptNumber} — transport on ${invoice.shipment.trackingNumber}`,
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: user.id,
        });
      }

      // In the invoice's currency, always. `input.amount` is what was handed
      // over, which may be shillings; the bill is settled by `credited`.
      const newPaid = paid + credited;
      const settled = newPaid + 0.001 >= total;

      /*
        CONDITIONAL ON THE FIGURE THIS TRANSACTION READ.

        Two clerks recording the same customer's payment at the same moment
        both read the same amountPaid, and under READ COMMITTED the plain
        update let both through: two payments, two receipts, two ledger lines,
        and one of the credits silently lost from the bill. The write now only
        lands if amountPaid is still what was read; the loser touches nothing
        further because this throw unwinds the whole transaction — payment,
        receipt and ledger line included.
      */
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, amountPaid: invoice.amountPaid },
        data: {
          amountPaid: new Prisma.Decimal(newPaid),
          status: settled ? "PAID" : "PARTIALLY_PAID",
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          "A payment landed on this bill a moment ago. Reload the page and check the balance before recording again."
        );
      }

      /*
        The flight shuts its own books.

        Almost every batch will end this way — the last customer pays and the
        close happens with nobody deciding anything, which is the only version
        of this that reliably happens every week. Inside the same transaction
        as the payment, so a batch cannot end up closed by money that failed to
        save. Cheap when it is not the last bill: one count, then it stops.
      */
      const closedNow = settled
        ? await settleBatchIfClear(tx, invoice.shipment.batchId)
        : false;

      // Confirming the final payment is one action: receipt AND pickup note.
      // Making the note a second click left cargo sitting paid-but-unreleasable
      // whenever someone was interrupted between the two.
      if (settled) {
        const shipment = await tx.shipment.findUnique({
          where: { id: invoice.shipment.id },
          select: {
            id: true,
            status: true,
            customerId: true,
            currency: true,
            pickupNote: { select: { id: true, status: true, noteNumber: true } },
            // Any case that blocks pickup, not just a missing shipment.
            //
            // This filtered on status "OPEN" and type MISSING_SHIPMENT, which
            // was two holes at once. A case moved to UNDER_INVESTIGATION stops
            // matching "OPEN", so the gate opened and a pickup note could be
            // issued for cargo somebody was actively hunting for — the exact
            // thing the owner said must never happen. And damaged, wrong-item
            // and held cargo were never covered at all.
            exceptions: {
              /* BOTH DIMENSIONS, like findPickupLock. Status alone counted
                 every open case as a blocker, including ones that do not lock
                 a pickup at all — so cargo with a routine query against it sat
                 waiting for a note nobody was withholding on purpose. */
              where: {
                status: { in: PICKUP_LOCKING_STATUSES },
                type: { in: PICKUP_LOCKING_TYPES },
              },
              select: { id: true },
            },
          },
        });

        /*
          ANY NOTE AT ALL, NOT JUST AN ACTIVE ONE.

          PickupNote.shipmentId is unique, so a consignment carries one note for
          its whole life. This tested only for an ACTIVE one — so a shipment
          whose note had been cancelled (a payment reversed, a release undone)
          passed the test, the create hit the unique index, and the transaction
          unwound: the customer's money was refused outright with a database
          error. The other three places that issue a note all test for any note,
          two of them with a comment about this exact constraint.

          Not issuing one here is the right outcome. A cancelled note was
          cancelled by somebody; re-deciding it is Finance's call on the bill's
          own page, not a side effect of taking money.
        */
        const hasNote = shipment?.pickupNote != null;
        const blocked = (shipment?.exceptions.length ?? 0) > 0;
        const atDar = shipment?.status === "RECEIVED_AT_DAR";

        /*
          A NOTE THAT IS STILL GOOD, ON CARGO THAT WAS HELD.

          Charging storage on a settled bill reopens the debt and puts the
          consignment back on the shelf, deliberately leaving its note alive —
          the note cannot be reissued, so destroying it would strand the cargo
          for ever. Paying the storage is what lets it go again, and this is
          where that happens: the note it already holds is the clearance, and
          the cargo simply becomes collectable once more.
        */
        if (
          shipment &&
          shipment.pickupNote?.status === "ACTIVE" &&
          !blocked &&
          atDar
        ) {
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
              note: `Balance cleared. Pickup note ${shipment.pickupNote.noteNumber} stands.`,
              actorId: user.id,
            },
          });
        }

        if (shipment && !hasNote && !blocked && atDar) {
          const note = await tx.pickupNote.create({
            data: {
              noteNumber: await nextPickupNoteNumber(tx),
              shipmentId: shipment.id,
              customerId: shipment.customerId,
              amountPaid: new Prisma.Decimal(newPaid),
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
              note: `Payment confirmed. Pickup note ${note.noteNumber} issued.`,
              actorId: user.id,
            },
          });

          issuedNote = note.noteNumber;
        }
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.record",
          entity: "Payment",
          entityId: payment.id,
          summary:
            tenderedCurrency === invoice.currency
              ? `Received ${invoice.currency} ${input.amount.toLocaleString()} for ${invoice.shipment.trackingNumber} (${receipt.receiptNumber})`
              : `Received ${tenderedCurrency} ${input.amount.toLocaleString()} — ${invoice.currency} ${credited.toLocaleString()} at ${rateUsed?.toLocaleString()} — for ${invoice.shipment.trackingNumber} (${receipt.receiptNumber})`,
          metadata: {
            account: account?.name ?? null,
            reference: input.reference ?? null,
            tenderedCurrency,
            tendered: input.amount,
            credited,
            exchangeRate: rateUsed,
            proofs: proofs.length,
            /* So the audit log says why a batch changed status a second
               later, rather than leaving it looking spontaneous. */
            closedBatch: closedNow,
          },
        },
        tx
      );

      return { receiptNumber: receipt.receiptNumber, closedBatch: closedNow };
    });

    revalidatePath("/app/finance");
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/finance/payments");
    revalidatePath("/app/finance/pickup-notes");
    revalidatePath("/app/release");
    revalidatePath("/app/shipments");
    return ok({
      receiptNumber: receiptNumber.receiptNumber,
      pickupNoteNumber: issuedNote,
      closedBatch: receiptNumber.closedBatch,
    });
  } catch (error) {
    /* The unique index refusing a repeat, not a fault — see lib/idempotency.ts.
       Said as plainly as the findFirst guard says it, so the desk cannot tell
       which of the two caught it and does not need to. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been recorded. Reload the page — recording it again would take the same money twice."
      );
    }
    return fail(toActionError(error));
  }
}

/**
 * The gate between money and cargo. A pickup note is the only thing that moves
 * a shipment to READY_FOR_PICKUP, and only Finance can issue one.
 *
 * Two things now open that gate, not one. It used to mean exactly "the bill is
 * settled": an unpaid invoice was refused here, full stop. Approved credit is
 * the second reason, and the whole point of credit — Finance has already read
 * the customer's exposure and agreed this consignment may go unpaid, so
 * refusing it here would have granted credit and then denied the thing it was
 * granted for. Everything else holds: an unpaid bill with no approved credit is
 * still refused, and so is one whose credit request nobody has answered.
 */
export async function issuePickupNote(
  _prev: ActionResult<{ noteNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ noteNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("pickupNote.issue");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail("Missing shipment.");

  try {
    const noteNumber = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          customerId: true,
          currency: true,
          pickupNote: { select: { id: true, status: true, noteNumber: true } },
          invoice: {
            select: {
              id: true,
              status: true,
              total: true,
              amountPaid: true,
              // Whether this cargo is allowed to leave unpaid, and on what terms.
              creditStatus: true,
              creditTermDays: true,
            },
          },
          // Any case that blocks pickup, not just a missing shipment.
          //
          // This filtered on status "OPEN" and type MISSING_SHIPMENT, which
          // was two holes at once. A case moved to UNDER_INVESTIGATION stops
          // matching "OPEN", so the gate opened and a pickup note could be
          // issued for cargo somebody was actively hunting for — the exact
          // thing the owner said must never happen. And damaged, wrong-item
          // and held cargo were never covered at all.
          exceptions: {
            /* Both dimensions — see the note in recordPayment. */
            where: {
              status: { in: PICKUP_LOCKING_STATUSES },
              type: { in: PICKUP_LOCKING_TYPES },
            },
            select: { id: true },
          },
        },
      });
      if (!shipment) throw new Error("Shipment not found.");

      // Any existing note, not merely an active one. A shipment carries at most
      // one note — the row is unique on shipmentId — so after a cancellation
      // every other gate below would pass and the create would die on a raw
      // database constraint in front of the clerk. Refusing here says something
      // a person can act on.
      if (shipment.pickupNote) {
        const existing = shipment.pickupNote;
        throw new Error(
          existing.status === "ACTIVE"
            ? `A pickup note (${existing.noteNumber}) is already active for this cargo.`
            : existing.status === "USED"
              ? `Pickup note ${existing.noteNumber} was already used to collect this cargo.`
              : `Pickup note ${existing.noteNumber} was cancelled. This cargo cannot be issued a second note — reopen the cancelled one or raise it with the CEO.`
        );
      }
      if (shipment.status !== "RECEIVED_AT_DAR") {
        throw new Error(
          "Cargo must be checked in at the Dar warehouse before a pickup note can be issued."
        );
      }
      if (shipment.exceptions.length > 0) {
        throw new Error(
          "This cargo is flagged as missing. Resolve the exception first."
        );
      }
      if (!shipment.invoice) throw new Error("Raise an invoice first.");

      const outstanding =
        toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid);

      /* Approved credit, and only approved credit, releases an open bill.
         REQUESTED does not: a request nobody has answered has granted nothing,
         and the cargo stands still until somebody decides. DRAFT and VOID are
         excluded for the same reason every credit query excludes them — the
         first is a figure nobody signed off, the second is not a bill. */
      const onCredit =
        shipment.invoice.creditStatus === "APPROVED" &&
        shipment.invoice.status !== "DRAFT" &&
        shipment.invoice.status !== "VOID";

      if (shipment.invoice.status !== "PAID" && !onCredit) {
        throw new Error(
          shipment.invoice.creditStatus === "REQUESTED"
            ? `${shipment.currency} ${outstanding.toLocaleString()} is still outstanding, and the credit request on this bill has not been answered yet.`
            : `${shipment.currency} ${outstanding.toLocaleString()} is still outstanding on this invoice.`
        );
      }

      /* The approval opens the gate; the money decides what is WRITTEN DOWN. A
         customer who was granted terms and then paid before collecting has
         settled their bill, and neither the history nor the audit log should
         record that as cargo released against a debt. */
      const releasedUnpaid = onCredit && outstanding > 0.005;

      const note = await tx.pickupNote.create({
        data: {
          noteNumber: await nextPickupNoteNumber(tx),
          shipmentId: shipment.id,
          customerId: shipment.customerId,
          // What was actually settled at this moment, which on a credit release
          // is nothing. The slip does not print this figure for a credit note —
          // it derives what is still OWED from the invoice, because this one
          // freezes here and never rises when the customer pays.
          amountPaid: shipment.invoice.amountPaid,
          currency: shipment.currency,
          issuedById: user.id,
        },
      });

      const now = new Date();
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: "READY_FOR_PICKUP", readyForPickup: now },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: "RECEIVED_AT_DAR",
          toStatus: "READY_FOR_PICKUP",
          location: "Dar es Salaam warehouse",
          /* The history said "Payment confirmed" for every release, which on a
             credit release is the opposite of what happened — and this line is
             what somebody reads months later when they ask why cargo left
             against an open bill. */
          note: releasedUnpaid
            ? `Released on credit${shipment.invoice.creditTermDays ? ` (${shipment.invoice.creditTermDays}-day terms)` : ""} — ${shipment.currency} ${outstanding.toLocaleString()} unpaid. Pickup note ${note.noteNumber} issued.`
            : `Payment confirmed. Pickup note ${note.noteNumber} issued.`,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "pickupNote.issue",
          entity: "PickupNote",
          entityId: note.id,
          summary: releasedUnpaid
            ? `Issued ${note.noteNumber} for ${shipment.trackingNumber} on credit — ${shipment.currency} ${outstanding.toLocaleString()} unpaid`
            : `Issued ${note.noteNumber} for ${shipment.trackingNumber}`,
        },
        tx
      );

      return note.noteNumber;
    });

    revalidatePath("/app/finance/pickup-notes");
    revalidatePath(`/app/cargo/${shipmentId}`);
    revalidatePath("/app/release");
    return ok({ noteNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function cancelPickupNote(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("pickupNote.cancel");
  } catch (error) {
    return fail(toActionError(error));
  }

  const noteId = String(formData.get("noteId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!noteId) return fail("Missing pickup note.");
  if (reason.length < 3) return fail("Give a reason for cancelling.");

  try {
    await prisma.$transaction(async (tx) => {
      const note = await tx.pickupNote.findUnique({
        where: { id: noteId },
        select: {
          id: true,
          status: true,
          noteNumber: true,
          shipment: { select: { id: true, status: true, trackingNumber: true } },
        },
      });
      if (!note) throw new Error("Pickup note not found.");
      if (note.status !== "ACTIVE") {
        throw new Error("Only an active pickup note can be cancelled.");
      }

      await tx.pickupNote.update({
        where: { id: noteId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });

      // The cargo goes back to sitting in the warehouse, still paid for.
      if (note.shipment.status === "READY_FOR_PICKUP") {
        await tx.shipment.update({
          where: { id: note.shipment.id },
          data: { status: "RECEIVED_AT_DAR", readyForPickup: null },
        });
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: note.shipment.id,
            fromStatus: "READY_FOR_PICKUP",
            toStatus: "RECEIVED_AT_DAR",
            location: "Dar es Salaam warehouse",
            note: `Pickup note ${note.noteNumber} cancelled: ${reason}`,
            actorId: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "pickupNote.cancel",
          entity: "PickupNote",
          entityId: noteId,
          summary: `Cancelled ${note.noteNumber} (${note.shipment.trackingNumber}): ${reason}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/pickup-notes");
    revalidatePath("/app/release");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Say which account a payment already taken actually landed in.
 *
 * Recording a payment does not require naming an account — deliberately, so the
 * counter is never blocked on a fact the clerk may not have yet. The cost of
 * that choice is money sitting in the books with no address: real money the
 * business holds, in no account, and therefore with no ledger line either.
 *
 * This is how that gets closed. It is the only place a ledger entry is written
 * after the fact, and it writes exactly the entry recordPayment would have
 * written had the account been named at the counter — same amount, same rate,
 * same date the money actually moved.
 *
 * Only for payments that have NO account yet. Moving money that has already
 * been booked from one account to another is a different act with a different
 * shape: the ledger is append-only, so that would be a reversal and a
 * re-posting, not an edit, and it should be asked for explicitly.
 */
export async function attributePayment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("payment.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  const paymentId = String(formData.get("paymentId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!paymentId) return fail("Missing payment.");
  if (!accountId) return fail("Choose the account the money went into.");

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          receipt: { select: { receiptNumber: true } },
          invoice: {
            select: {
              invoiceNumber: true,
              currency: true,
              /* The fallback when the payment carries no rate of its own. */
              exchangeRate: true,
              shipment: { select: { trackingNumber: true } },
            },
          },
        },
      });
      if (!payment) throw new Error("That payment no longer exists.");
      if (payment.accountId) {
        throw new Error(
          "This payment is already attributed to an account. Correcting a booked payment means reversing it in the ledger, not editing it."
        );
      }

      const account = await tx.companyAccount.findUnique({
        where: { id: accountId },
        select: { id: true, name: true, kind: true, currency: true, active: true },
      });
      if (!account) throw new Error("That account no longer exists.");
      if (!account.active) throw new Error(`${account.name} has been archived.`);
      if (account.currency !== payment.currency) {
        throw new Error(
          `${account.name} is a ${account.currency} account, so a payment of ${payment.currency} ${toNumber(payment.amount).toLocaleString()} cannot have landed in it.`
        );
      }

      await tx.payment.update({
        where: { id: payment.id },
        /* The method comes with the account. This is the one path that names an
           account on a payment that never had one, and every such payment was
           booked with a method somebody guessed at before they knew where the
           money was — leaving it would keep a row whose stored method
           contradicts the account it now names. */
        data: { accountId: account.id, method: methodForKind(account.kind) },
      });

      // The line that was never written, written now — at the rate and on the
      // date the money actually moved, not today's.
      //
      // Valued on the WHOLE transfer. It used to take creditedAmount when the
      // bill was in dollars, which is the cargo half once a payment can carry
      // transport — the same self-contradicting row recordPayment used to
      // write, where the native figure is the lump and its dollar twin is not.
      /* The payment's own rate, or the bill's frozen one. A payment taken
         before this column was written has null, and treating that as "no
         conversion" books a shilling figure as dollars. */
      const attributedRate =
        payment.exchangeRate !== null
          ? toNumber(payment.exchangeRate)
          : payment.invoice?.exchangeRate != null
            ? toNumber(payment.invoice.exchangeRate)
            : null;
      const usdValue =
        payment.currency === "USD"
          ? toNumber(payment.amount)
          : attributedRate
            ? toNumber(payment.amount) / attributedRate
            : toNumber(payment.amount);

      await postLedgerEntry(tx, {
        accountId: account.id,
        currency: account.currency,
        direction: "IN",
        kind: "CUSTOMER_PAYMENT",
        amount: toNumber(payment.amount),
        amountUsd: usdValue,
        exchangeRate:
          payment.exchangeRate === null ? null : toNumber(payment.exchangeRate),
        occurredAt: payment.paidAt,
        description: `${payment.receipt?.receiptNumber ?? "Payment"} — ${payment.invoice?.invoiceNumber} for ${payment.invoice?.shipment.trackingNumber}`,
        sourceEntity: "Payment",
        sourceId: payment.id,
        paymentId: payment.id,
        recordedById: user.id,
      });

      /*
        AND THE FARE, WHICH HAS BEEN OWED TO A TILL ALL THIS TIME.

        A payment taken without naming an account writes no ledger line at all
        — neither leg. This path exists to write the line that was missed, and
        it wrote only the one: the transfer arrived, and the transport inside
        it never left. The tin was short by the fare from the day the driver
        was paid, and no screen could say why.

        Guarded on the source still being named, because a fare with nowhere
        to come from is exactly what the counter refuses in the first place.
      */
      const unbookedFare = toNumber(payment.transportAmount);
      if (unbookedFare > 0 && payment.transportSourceId) {
        const fareAccount = await tx.companyAccount.findUnique({
          where: { id: payment.transportSourceId },
          select: { id: true, name: true, currency: true },
        });
        if (!fareAccount) {
          throw new Error(
            "The account this payment's transport was settled from no longer exists, so the transport cannot be booked."
          );
        }
        await postLedgerEntry(tx, {
          accountId: fareAccount.id,
          currency: fareAccount.currency,
          direction: "OUT",
          kind: "TRANSPORT_OUT",
          amount: unbookedFare,
          amountUsd:
            fareAccount.currency === "USD"
              ? unbookedFare
              : attributedRate
                ? unbookedFare / attributedRate
                : unbookedFare,
          exchangeRate: attributedRate,
          occurredAt: payment.paidAt,
          description: `${payment.receipt?.receiptNumber ?? "Payment"} — transport`,
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: user.id,
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.attribute",
          entity: "Payment",
          entityId: payment.id,
          summary: `Attributed ${payment.receipt?.receiptNumber ?? "a payment"} of ${payment.currency} ${toNumber(payment.amount).toLocaleString()} to ${account.name}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/payments");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * The account, insisted upon at the point of writing.
 *
 * Both payment writes load their account inside `if (input.accountId)`, which
 * dates from when naming one was optional. It is required now — the schemas
 * refuse a payment without it — so this can only be null if that rule is ever
 * relaxed without revisiting the writes.
 *
 * It matters because `Payment.method` is NOT NULL and indexed, and is derived
 * from this account. A bare `account!.kind` would hand Prisma an undefined and
 * fail deep inside the transaction with a schema error nobody at a counter can
 * act on. This says what actually went wrong.
 */
function mustHaveAccount<T>(account: T | null): T {
  if (!account) {
    throw new Error(
      "This payment names no account, so there is nothing to record it against. Pick where the money landed and try again."
    );
  }
  return account;
}

/** One bill the search turned up, with everything the form needs to fill itself. */
export type BillableHit = {
  invoiceId: string;
  invoiceNumber: string;
  trackingNumber: string;
  customerName: string;
  goods: string;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  /** The rate frozen on the bill, so a shilling payment converts at what was quoted. */
  rate: number | null;
  status: string;
  /** The flight it came in on, for the desk working one arrival at a time. */
  batchId: string | null;
  batchNumber: string | null;
  flightNumber: string | null;
  /**
   * A payment already sent up for this bill and waiting on Finance.
   *
   * This picker is one click from taking money, so it is the last place a
   * duplicate can be started and the best place to stop one. recordPayment
   * refuses it anyway — but only after the form has been filled in, and by
   * then the customer at the counter has often already been asked to pay
   * again.
   */
  claimed?: boolean;
};

/** One flight with money still owed on it. */
export type BillableBatch = {
  id: string;
  batchNumber: string;
  flightNumber: string | null;
  arrivedAt: Date | null;
  /** How many bills on it are still short, and by how much in dollars. */
  bills: number;
  owedUsd: number;
};

/**
 * Find the bill a payment belongs to, from whatever the customer said on the
 * phone.
 *
 * The owner's flow: Finance decides to record an income, searches a customer or
 * a tracking number, picks the cargo, and enters what came in. So the search
 * has to accept all the things a person actually has in front of them — the
 * tracking number off a label, a name half-remembered, the invoice number from
 * a message, the phone number that just rang — rather than making them know
 * which field their scrap of information belongs to.
 *
 * Settled bills are returned too, and marked. Somebody searching a tracking
 * number wants to know it is already paid far more than they want an empty
 * result that leaves them wondering whether they typed it wrong.
 */
export async function searchBillable(query: string): Promise<BillableHit[]> {
  try {
    /*
      Anybody who may put a payment against a bill may look one up.

      This required payment.record, which is the authority to say money ARRIVED —
      so Support, whose whole job is fielding "I have paid, here is the
      screenshot", could not search for the bill it was being told about. It had
      to already know the tracking number. payment.submit is the right gate: it
      is held by Support and by Finance, and finding a bill commits nothing.
    */
    await authorize("payment.submit");
  } catch {
    return [];
  }

  const q = query.trim();
  if (q.length < 2) return [];

  // The clerk picking a bill out of these hits is the reader, so the cargo line
  // is theirs. It was the stored text, which put 手机配件 in the one place a
  // Dar desk has to recognise the right consignment before taking money for it.
  const locale = await viewerLocale();

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "WRITTEN_OFF" },
      /* Typing a tracking number was making an in-transit bill pickable on a
         payment form. Searching is how somebody finds the bill they are about
         to take money against, so it answers with what can be paid for. */
      shipment: COLLECTABLE_SHIPMENT_WHERE,
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { shipment: { trackingNumber: { contains: q, mode: "insensitive" } } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { phone: { contains: q } } },
      ],
    },
    /* Unpaid first — the reason somebody is searching — then newest. */
    orderBy: [{ status: "asc" }, { issuedAt: "desc" }],
    take: 12,
    select: {
      id: true,
      invoiceNumber: true,
      currency: true,
      total: true,
      amountPaid: true,
      status: true,
      exchangeRate: true,
      customer: { select: { name: true } },
      shipment: {
        select: {
          trackingNumber: true,
          ...selectText("description"),
          batch: {
            select: { id: true, batchNumber: true, flightNumber: true },
          },
        },
      },
    },
  });

  const claims = await claimsForInvoices(invoices.map((i) => i.id));
  return invoices.map((inv) => ({
    ...toBillable(inv, locale),
    claimed: claims.has(inv.id),
  }));
}

/** One shape for a searched bill and a queued one, so one row renders both. */
function toBillable(
  inv: {
    id: string;
    invoiceNumber: string;
    currency: string;
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    status: string;
    exchangeRate: Prisma.Decimal | null;
    customer: { name: string };
    shipment: {
      trackingNumber: string;
      batch: { id: string; batchNumber: string; flightNumber: string | null } | null;
    };
  },
  locale: Locale
): BillableHit {
  const total = toNumber(inv.total);
  const paid = toNumber(inv.amountPaid);
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    trackingNumber: inv.shipment.trackingNumber,
    customerName: inv.customer.name,
    goods: cargoText(locale, inv.shipment, "description"),
    currency: inv.currency,
    total,
    paid,
    outstanding: Math.max(0, total - paid),
    rate: inv.exchangeRate === null ? null : toNumber(inv.exchangeRate),
    status: inv.status,
    batchId: inv.shipment.batch?.id ?? null,
    batchNumber: inv.shipment.batch?.batchNumber ?? null,
    flightNumber: inv.shipment.batch?.flightNumber ?? null,
  };
}

/**
 * Who has not paid yet — the list, before anybody types anything.
 *
 * Recording a payment used to begin at an empty search box, which asks the
 * desk to already know the answer. Most of the time they do not: the question
 * in the room is "who on this flight still owes us", and that is a list, not a
 * lookup. So the panel now opens holding it, and the search box narrows it
 * rather than being the only way in.
 *
 * Grouped by flight because that is how the money actually arrives — a plane
 * lands, its customers are rung through in a sitting, and the desk wants that
 * arrival on top rather than an alphabet of everybody who has ever owed
 * anything. Flights are ordered by what is outstanding on them, so the one
 * worth working is first.
 *
 * Drafts are excluded throughout. A price Finance has not signed off is not
 * something to take money against, and it is the same rule the collections
 * queue already applies.
 */
export async function billableQueue(
  batchId?: string
): Promise<{ batches: BillableBatch[]; hits: BillableHit[] }> {
  try {
    /* Same gate as the search beside it: finding a bill commits nothing, and
       Support is the desk most often asking who still owes. */
    await authorize("payment.submit");
  } catch {
    return { batches: [], hits: [] };
  }

  const locale = await viewerLocale();

  const [rows, grouped] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        /* Drafts and written-off bills are not money anybody may take. */
        status: { in: ["UNPAID", "PARTIALLY_PAID"] },
        /* Only what somebody could actually collect on. This queue is the
           picker behind the payment forms and it rolls into the per-flight
           chips, so un-landed cargo was both offered as payable and counted
           into a figure that reads as ready to collect. */
        shipment: batchId
          ? { batchId, ...COLLECTABLE_SHIPMENT_WHERE }
          : COLLECTABLE_SHIPMENT_WHERE,
      },
      /* Oldest first: the bill that has been owed longest is the one somebody
         should be ringing about, which is the opposite of the search's order. */
      orderBy: [{ issuedAt: "asc" }],
      take: 40,
      select: {
        id: true,
        invoiceNumber: true,
        currency: true,
        total: true,
        amountPaid: true,
        status: true,
        exchangeRate: true,
        customer: { select: { name: true } },
        shipment: {
          select: {
            trackingNumber: true,
            ...selectText("description"),
            batch: {
              select: { id: true, batchNumber: true, flightNumber: true },
            },
          },
        },
      },
    }),
    /* Every flight with something still owed on it — computed across ALL of
       them, not just the forty rows above, so the chips are a true picture of
       what is outstanding rather than a summary of the current page. */
    prisma.invoice.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIALLY_PAID"] },
        shipment: { batchId: { not: null } },
      },
      select: {
        total: true,
        amountPaid: true,
        currency: true,
        exchangeRate: true,
        shipment: {
          select: {
            batch: {
              select: {
                id: true,
                batchNumber: true,
                flightNumber: true,
                arrivalDate: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const byBatch = new Map<string, BillableBatch>();
  for (const inv of grouped) {
    const batch = inv.shipment.batch;
    if (!batch) continue;
    const outstanding = Math.max(
      0,
      toNumber(inv.total) - toNumber(inv.amountPaid)
    );
    if (outstanding <= 0) continue;
    /* Totalled in dollars because a flight carries both currencies and a
       number in no unit is the defect this codebase keeps having to undo. A
       shilling bill converts at the rate frozen on it, never at today's. */
    const usd =
      inv.currency === "USD"
        ? outstanding
        : inv.exchangeRate && toNumber(inv.exchangeRate) > 0
          ? outstanding / toNumber(inv.exchangeRate)
          : 0;
    const seen = byBatch.get(batch.id);
    if (seen) {
      seen.bills += 1;
      seen.owedUsd += usd;
    } else {
      byBatch.set(batch.id, {
        id: batch.id,
        batchNumber: batch.batchNumber,
        flightNumber: batch.flightNumber,
        arrivedAt: batch.arrivalDate,
        bills: 1,
        owedUsd: usd,
      });
    }
  }

  /* Which of these already has money waiting on Finance. One query for the
     whole queue — the picker's second filter reads it, and so does the row,
     which is one press from taking the money a second time. */
  const claims = await claimsForInvoices(rows.map((inv) => inv.id));

  return {
    batches: [...byBatch.values()].sort((a, b) => b.owedUsd - a.owedUsd),
    hits: rows.map((inv) => ({
      ...toBillable(inv, locale),
      claimed: claims.has(inv.id),
    })),
  };
}

/**
 * Cancelling a bill that should never have been raised.
 *
 * Every other correction in this file changes what a bill SAYS. This one says
 * the bill itself was a mistake — the flight is still in the air and somebody
 * priced it early, the cargo was registered twice, the wrong customer was
 * picked. Until now there was no way back from that: a cost can be voided and
 * a payment can be voided, but a bill, once raised, was permanent, and the
 * desk that made a two-second mistake had no button anywhere.
 *
 * THE ROW IS REMOVED RATHER THAN MARKED VOID, and that is forced by the
 * schema: Invoice.shipmentId is unique, so a cancelled bill left in place
 * would occupy the one slot that consignment has and the pricing engine —
 * which only ever touches a DRAFT — would skip it forever. The cargo would
 * arrive in Dar and could never be billed again. What is kept instead is the
 * audit row written below: the number, the figures, who cancelled it and why,
 * behind audit.view. A bill is not a ledger entry; nothing on the register
 * moves here, because a bill with live money against it is refused outright.
 *
 * Refused when anything real is attached to it:
 *   · a payment that has not been cancelled — cancel the payment first, so the
 *     money is unwound deliberately and on its own record
 *   · a pickup note still standing — the cargo has been cleared to leave
 *   · a closed flight — its statement is frozen, and a bill vanishing out of a
 *     profit figure the owner has already read is exactly what closing prevents
 *
 * A draft is nobody's demand for money, so Finance may drop its own. A
 * confirmed bill has been quoted to a customer, and restating that is the
 * CEO's, the same rule cancelling a payment follows.
 */
export async function voidInvoice(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  const parsed = z
    .object({
      invoiceId: z.string().trim().min(1, "Missing invoice."),
      reason: z
        .string()
        .trim()
        .min(3, "Say why this bill is being cancelled.")
        .max(500, "Keep the reason under 500 characters."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          amountPaid: true,
          currency: true,
          shipmentId: true,
          shipment: {
            select: {
              trackingNumber: true,
              batch: { select: { batchNumber: true, closedAt: true } },
              pickupNote: { select: { noteNumber: true, status: true } },
            },
          },
          payments: {
            where: { voidedAt: null },
            select: { id: true },
          },
        },
      });
      if (!invoice) throw new Error(t(locale, "That bill no longer exists."));

      // A draft is the system's own guess and nobody has been asked for it.
      // A confirmed figure has been quoted, and taking a quote back is the
      // CEO's — same hand that cancels a payment.
      if (invoice.status !== "DRAFT" && !can(user.role, "ledger.adjust")) {
        throw new Error(
          t(
            locale,
            "This price has already been confirmed, so only the owner can cancel the bill. Ask him, or correct the figure instead."
          )
        );
      }

      if (invoice.status === "WRITTEN_OFF") {
        throw new Error(
          `${invoice.invoiceNumber} ${t(locale, "was written off when its flight closed. That decision is part of a closed statement.")}`
        );
      }

      if (invoice.payments.length > 0) {
        throw new Error(
          `${invoice.invoiceNumber} ${t(locale, "has money recorded against it. Cancel the payment first — then the bill can go.")}`
        );
      }
      if (toNumber(invoice.amountPaid) > 0.005) {
        throw new Error(
          `${invoice.invoiceNumber} ${t(locale, "has money recorded against it. Cancel the payment first — then the bill can go.")}`
        );
      }

      const note = invoice.shipment.pickupNote;
      if (note && note.status !== "CANCELLED") {
        throw new Error(
          `${note.noteNumber} ${t(locale, "is still standing on this cargo, so it is cleared to leave. Cancel the pickup note first.")}`
        );
      }

      const batch = invoice.shipment.batch;
      if (batch?.closedAt) {
        throw new Error(
          `${batch.batchNumber} ${t(locale, "is closed and its statement is frozen. Reopen it before changing what it billed.")}`
        );
      }

      /* The record of what was cancelled, written before the row goes and in
         the same transaction, so the two cannot come apart. */
      await recordAudit(
        {
          actor: user,
          action: "invoice.void",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `Cancelled ${invoice.invoiceNumber} (${invoice.shipment.trackingNumber}) — ${parsed.data.reason}`,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            shipment: invoice.shipment.trackingNumber,
            batch: batch?.batchNumber ?? null,
            statusWhenCancelled: invoice.status,
            total: toNumber(invoice.total).toFixed(2),
            currency: invoice.currency,
            reason: parsed.data.reason,
          },
        },
        tx
      );

      /* Claimed on the balance and the status this transaction checked: a
         payment landing between the guard above and this line would otherwise
         be deleted along with the bill it settled. */
      const removed = await tx.invoice.deleteMany({
        where: {
          id: invoice.id,
          status: invoice.status,
          amountPaid: invoice.amountPaid,
        },
      });
      if (removed.count === 0) {
        throw new Error(
          t(
            locale,
            "This bill changed a moment ago. Reload and look at it again before cancelling."
          )
        );
      }

      return invoice.shipment.trackingNumber;
    });

    revalidatePath("/app/finance");
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/cargo");
    revalidatePath(`/app/cargo/${trackingNumber}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * ONE REAL PAYMENT, ACROSS SEVERAL OF A CUSTOMER'S BILLS.
 *
 * A customer with three unpaid consignments sends one mobile-money transfer for
 * all three. Recorded as three payments — which is all the counter could do —
 * that is three receipts, three ledger lines and three account movements for a
 * deposit the bank statement shows exactly once, and a reconciliation that can
 * never be made to agree.
 *
 * So this writes ONE payment, ONE receipt and ONE ledger line for the money that
 * actually arrived, and a settlement against each bill it answers. An allocation
 * moves nothing: the account went up once, above, and the allocations only say
 * which bills that money was put against. What is received and not allocated is
 * the customer's credit, derived from the difference and never stored.
 *
 * Deliberately its own action rather than a mode inside recordPayment. That one
 * is called by the counter, by Finance and by the verification flow, and money
 * code that grows a second shape is money code nobody can reason about.
 *
 * Bills are priced in dollars and customers pay in shillings, so the money that
 * arrives is almost never in the currency of the bills it settles. It converts
 * at the rate FROZEN ONTO THE BILL — the rate the customer was quoted — never
 * at today's, or the same bill would settle for a different amount depending on
 * the day it was paid.
 *
 * What is still refused, because it cannot be answered without guessing: bills
 * in two different currencies in one payment, and bills quoted at two different
 * rates. Either would need a rate per allocation and a receipt stating four
 * figures. They are rare, they are separable, and the customer's own cargo page
 * settles each one properly on its own.
 */
export async function recordCustomerPayment(
  _prev: ActionResult<{ receiptNumber: string; settled: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ receiptNumber: string; settled: number }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  /* Read before the schema parse: it is not part of what a payment IS, it is
     how this request identifies itself. See lib/idempotency.ts. */
  const idempotencyKey = idempotencyKeyFrom(formData);

  const parsed = customerPaymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  /*
    THE PROOF, IF THERE IS ANY.

    Stored BEFORE the transaction opens, deliberately. Uploading inside it would
    hold a database transaction open across a network call to blob storage; and
    a proof that fails to store has to fail the whole thing loudly rather than
    leaving a payment whose evidence nobody can find.

    Optional, always. Cash across the counter has no screenshot, and refusing
    the payment does not produce one — it produces a payment nobody records.
  */
  let proofs: { url: string; contentType: string; bytes: number; filename: string }[];
  try {
    const files = filesFrom(formData, "proof");
    proofs = await Promise.all(
      files.map(async (file) => {
        const stored = await putDocument(file, "proof");
        return { ...stored, filename: file.name || "proof" };
      })
    );
  } catch (error) {
    return fail(toActionError(error));
  }

  /*
    ONE TRANSFER, SEVERAL BILLS, AND THE DELIVERY.

    A customer with four consignments sends one amount covering all four and
    the transport to bring them. The whole figure stays in `amount` — that is
    what the account received and what the receipt says — but only the cargo
    half is available to settle bills. Allocating the transport would answer
    four invoices with money that is about to leave again for a driver.
  */
  const transport = input.transport ?? 0;
  if (transport > input.amount + 0.005) {
    return fail(
      `The transport (${input.currency} ${transport.toLocaleString()}) is more than the ` +
        `${input.currency} ${input.amount.toLocaleString()} that came in.`
    );
  }
  /* What is actually there for the bills. Rounded to the cent before it is
     compared, so a split typed to match it to the shilling is not refused by
     a floating-point tail. */
  const forBills = Math.round((input.amount - transport) * 100) / 100;
  /*
    THE FARE IS MEASURED AGAINST THE CARGO, NOT AGAINST THE TOTAL.

    This guard used to read "the fare cannot exceed what came in". That
    sentence was true when the desk typed the whole transfer and the fare
    was carved out of it. The screens now do the arithmetic the other way
    round — the total is the bill plus the fare, because that is what the
    customer actually hands over — and against THAT total the old test is
    an identity: the fare is always smaller, so it could never refuse
    anything again.

    An extra nought on a 10,000 fare would then settle the bill correctly,
    issue the pickup note, and quietly post 100,000 out of the cash tin,
    with nothing on any screen or server saying a word.

    So it is compared to the half that actually settles the bill, which is
    where a mistyped fare stands out. A delivery really can cost more than
    a small consignment's freight, so this is a question and not a wall:
    the desk ticks to say it is right, and that tick travels here.
  */
  if (transport > forBills + 0.005 && !input.transportConfirmed) {
    return fail(
      `The transport (${input.currency} ${transport.toLocaleString()}) is more than the ` +
        `${input.currency} ${forBills.toLocaleString()} going to the bills. ` +
        `Check the figure — if it is right, tick to confirm it.`
    );
  }
  const allocated = input.allocations.reduce((sum, a) => sum + a.amount, 0);
  /* Checked here for a plain answer, and again inside the transaction against
     figures read there — this one only saves a round trip. */
  if (allocated > forBills + 0.005) {
    return fail(
      `You have allocated ${input.currency} ${allocated.toLocaleString()} of a ` +
        `${input.currency} ${input.amount.toLocaleString()} payment` +
        (transport > 0
          ? `, of which ${input.currency} ${transport.toLocaleString()} is transport — ` +
            `leaving ${input.currency} ${forBills.toLocaleString()} for the bills`
          : "") +
        `. Money cannot be put against bills twice over.`
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true },
      });
      if (!customer) throw new Error("That customer no longer exists.");

      const invoices = await tx.invoice.findMany({
        where: { id: { in: input.allocations.map((a) => a.invoiceId) } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          /* The rate the customer was quoted, frozen when the bill was raised.
             It is what a payment in another currency converts at. */
          exchangeRate: true,
          total: true,
          amountPaid: true,
          customerId: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              batchId: true,
              /* Where the boxes are. Money may not be taken for cargo the Dar
                 floor has not confirmed — see lib/payable.ts. */
              status: true,
            },
          },
          submissions: {
            where: { status: "PENDING" },
            select: { submissionNumber: true },
          },
          /* AND A MERGED CLAIM THAT COVERS THIS BILL AMONG OTHERS.
             `submissions` only finds claims raised against this invoice. One
             transfer claimed across four consignments is anchored to one of
             them and allocated to all four, so the other three saw nothing
             here and could be paid a second time. */
          submissionAllocations: {
            where: { submission: { status: "PENDING" } },
            select: { submission: { select: { submissionNumber: true } } },
          },
        },
      });
      if (invoices.length !== input.allocations.length) {
        throw new Error("One of those bills no longer exists. Reload and try again.");
      }

      const byId = new Map(invoices.map((i) => [i.id, i]));

      for (const invoice of invoices) {
        if (invoice.customerId !== customer.id) {
          throw new Error(
            `${invoice.invoiceNumber} does not belong to ${customer.name}. A payment settles one customer's bills.`
          );
        }
        if (invoice.status === "DRAFT") {
          throw new Error(
            `${invoice.invoiceNumber} is still a draft. Confirm the price before taking money against it.`
          );
        }
        if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
          throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
        }
        /*
          EVERY BILL IN THE MERGE, NOT JUST THE FIRST.

          This endpoint takes a list of invoice ids and is reachable without
          the screen that built the list, which is precisely the bypass the
          rule forbids: one un-landed consignment slipped into an otherwise
          good set would be paid for along with the rest. Named in the
          refusal, because "one of them has not landed" is not something a
          desk can act on.
        */
        if (!isCollectable(invoice.shipment.status)) {
          throw new Error(notPayableMessage(invoice.shipment.trackingNumber));
        }
        /* The same refusal the single-invoice form makes, for the same reason:
           money already claimed and awaiting Finance must not be taken twice. */
        const claimed =
          invoice.submissions[0]?.submissionNumber ??
          invoice.submissionAllocations[0]?.submission.submissionNumber;
        if (claimed) {
          throw new Error(
            `${claimed} is already waiting to be verified against ` +
              `${invoice.invoiceNumber}. Verify that one instead of recording this money again.`
          );
        }
      }

      /*
        SHILLINGS IN, DOLLARS OFF THE BILL.

        Everything below is stated in TWO currencies and they must not be
        confused. `input.amount` and every allocation the form sent are in the
        currency the customer PAID — that is what the clerk is holding and what
        they ticked. `invoice.amountPaid`, and the allocation rows this writes,
        are in the currency of the BILL, because that is what a bill is
        denominated in and what "settled" is measured against.

        One rate for the whole payment, taken off the bills themselves. Bills in
        two currencies, or quoted at two different rates, would each need their
        own — a different receipt and a different conversation. Refused, not
        guessed.
      */
      const allocatedInvoices = input.allocations.map((a) => byId.get(a.invoiceId)!);
      const billCurrencies = new Set(allocatedInvoices.map((i) => i.currency));
      if (billCurrencies.size > 1) {
        throw new Error(
          `Those bills are in ${[...billCurrencies].join(" and ")}. One payment settles ` +
            `bills in one currency — take them separately.`
        );
      }
      const billCurrency = [...billCurrencies][0] ?? input.currency;
      const crossCurrency = billCurrency !== input.currency;

      /*
        EVERY BILL AT ITS OWN RATE.

        This once demanded that all the bills share one rate and refused when
        they did not. Two consignments quoted a fortnight apart carry the two
        rates published on those days — not a problem, the system working — and
        refusing turned one transfer into two payments, which is the thing this
        action exists to stop. Each allocation converts at the rate frozen onto
        the bill it answers, which is the figure that customer was quoted for
        that consignment.

        A bill carrying no rate at all still stops it: there is no honest
        shilling figure for it, and inventing one is how a bill gets argued
        about.
      */
      if (crossCurrency) {
        const bare = allocatedInvoices.find((i) => i.exchangeRate === null);
        if (bare) {
          throw new Error(
            `${bare.invoiceNumber} carries no exchange rate, so a payment in ` +
              `${input.currency} cannot be converted against it. Publish a rate and ` +
              `regenerate that bill, or settle it on its own cargo page.`
          );
        }
      }
      /* Quoted on the receipt and in the audit line when there is one figure to
         quote; null when the bills genuinely disagree, and then the allocation
         notes carry the rate each one used. */
      const rateUsed = crossCurrency
        ? (() => {
            const rates = new Set(
              allocatedInvoices.map((i) => toNumber(i.exchangeRate))
            );
            return rates.size === 1 ? ([...rates][0] as number) : null;
          })()
        : null;

      /*
        What one tendered figure is worth against the bill.

        Rounded to the cent the bill is denominated in, then snapped to the
        outstanding when it lands within a cent of it. The customer was quoted a
        whole number of shillings; converting that back can miss the last cent,
        and a bill left one cent short is a bill that never reads as paid — the
        pickup note is never issued and the cargo sits in the warehouse over a
        rounding error.
      */
      function credit(
        tendered: number,
        outstanding: number,
        billRate: number | null
      ): number {
        if (!crossCurrency || !billRate) return tendered;
        const converted =
          input.currency === LOCAL_CURRENCY
            ? tendered / billRate
            : tendered * billRate;
        const rounded = Math.round(converted * 100) / 100;
        return Math.abs(rounded - outstanding) <= 0.01 ? outstanding : rounded;
      }

      /* Nothing may be put against a bill beyond what it still owes. Overpayment
         is legitimate and stays with the customer as credit; overpayment hidden
         inside a bill is a balance nobody can explain later. */
      const credited = new Map<string, number>();
      for (const alloc of input.allocations) {
        const invoice = byId.get(alloc.invoiceId)!;
        const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);
        const against = credit(
          alloc.amount,
          outstanding,
          toNumber(invoice.exchangeRate)
        );
        if (against > outstanding + 0.005) {
          throw new Error(
            crossCurrency
              ? `${input.currency} ${alloc.amount.toLocaleString()} is ${billCurrency} ` +
                `${against.toLocaleString()} at this bill's own rate — more than the ` +
                `${billCurrency} ${outstanding.toLocaleString()} ${invoice.invoiceNumber} ` +
                `still owes. Allocate the rest to another bill, or leave it as the ` +
                `customer's credit.`
              : `${invoice.invoiceNumber} only owes ${invoice.currency} ${outstanding.toLocaleString()}. ` +
                `Allocate the rest to another bill, or leave it as the customer's credit.`
          );
        }
        credited.set(alloc.invoiceId, against);
      }

      /*
        WHERE THE TRANSPORT HALF IS SETTLED FROM.

        The same two rules the single-bill door enforces, for the same reasons:
        required as soon as there is any transport, because money that left no
        account leaves the till short against a register that balances; and
        cash or the Lipa number only, because a driver is not paid out of a
        bank account. The customer may still have sent the whole thing into
        the bank — where it landed and where the fare leaves from are two
        independent facts.
      */
      let transportAccount: {
        id: string;
        name: string;
        currency: string;
        kind: string;
      } | null = null;
      if (transport > 0) {
        if (!input.transportSourceId) {
          throw new Error(
            "Say which account the transport is settled from — the cash box or the Lipa number."
          );
        }
        transportAccount = await tx.companyAccount.findUnique({
          where: { id: input.transportSourceId },
          select: { id: true, name: true, currency: true, kind: true },
        });
        if (!transportAccount) {
          throw new Error("That transport account no longer exists.");
        }
        if (
          transportAccount.kind !== "CASH" &&
          transportAccount.kind !== "MOBILE_MONEY"
        ) {
          throw new Error(
            `Transport is settled in cash or off the Lipa number. ${transportAccount.name} is a bank account.`
          );
        }
        if (transportAccount.currency !== input.currency) {
          throw new Error(
            `${transportAccount.name} is a ${transportAccount.currency} account, so ${input.currency} transport cannot be settled from it.`
          );
        }
      }

      /* One pair of hands, twice — a double tap or a refreshed page. The
         conditional claims below catch two clerks racing each other; they
         cannot catch a first attempt that succeeded. */
      const echo = await tx.payment.findFirst({
        where: {
          customerId: customer.id,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          /* The account, not the kind of account — see the note on the same
             guard in recordPayment. */
          accountId: input.accountId,
          reference: input.reference || null,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        select: { receipt: { select: { receiptNumber: true } } },
      });
      if (echo) {
        throw new Error(
          `This payment has just been recorded${
            echo.receipt ? ` on receipt ${echo.receipt.receiptNumber}` : ""
          }. Reload the page — recording it again would take the same money twice.`
        );
      }

      let account: {
        id: string;
        name: string;
        kind: AccountKind;
        currency: string;
      } | null = null;
      if (input.accountId) {
        account = await tx.companyAccount.findUnique({
          where: { id: input.accountId },
          /* kind, because the stored method is read off the account now —
             see methodForKind. */
          select: {
            id: true,
            name: true,
            kind: true,
            currency: true,
            active: true,
          },
        }).then((a) => {
          if (!a) throw new Error("That account no longer exists.");
          if (!a.active) throw new Error(`${a.name} has been archived.`);
          if (a.currency !== input.currency) {
            throw new Error(
              `${a.name} is a ${a.currency} account, so a payment of ${input.currency} ` +
                `${input.amount.toLocaleString()} cannot have landed in it.`
            );
          }
          return { id: a.id, name: a.name, kind: a.kind, currency: a.currency };
        });
      }

      /* The payment is anchored to one of the bills it settles, because that
         column is what every existing reader of a payment still uses. Which one
         is arbitrary and says nothing — the allocations below are the truth. */
      /* Null for a deposit: money that has arrived against no bill yet. The
         column exists for the case where this payment was raised against one
         particular bill; the allocations are what actually settle anything. */
      const anchor = input.allocations.length
        ? byId.get(input.allocations[0].invoiceId)!
        : null;

      const payment = await tx.payment.create({
        data: {
          invoiceId: anchor?.id ?? null,
          customerId: customer.id,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          /* What the WHOLE payment is worth in the currency of the bills — not
             just the allocated part. Anything beyond what was allocated is the
             customer's credit, and `availableCredit` reads it from here against
             the allocation rows below, both in the bills' currency. */
          /* The delivery half, named on the money itself. `amount` above stays
             the whole transfer — the receipt and the account both say so —
             and this is what comes off it before anything settles a bill. */
          transportAmount: new Prisma.Decimal(transport),
          transportSourceId: transport > 0 ? transportAccount!.id : null,
          creditedAmount: new Prisma.Decimal(
            crossCurrency
              ? /* What the allocations actually settled, plus whatever is left
                   over valued at the rate of the last bill it would answer.
                   Only the allocated part is ever compared against a bill; the
                   remainder is credit, and `spareOf` in lib/customer-credit.ts
                   works from the native `amount` rather than from this.

                   THE LEFTOVER IS MEASURED FROM THE CARGO HALF, not from the
                   whole transfer. Otherwise the transport — money already
                   promised to a driver — would sit on the customer's account
                   as credit they could spend on their next consignment, and
                   the company would owe it twice. */
                Math.round(
                  ([...credited.values()].reduce((sum, n) => sum + n, 0) +
                    (rateUsed
                      ? (forBills - allocated) /
                        (input.currency === LOCAL_CURRENCY ? rateUsed : 1)
                      : 0)) *
                    100
                ) / 100
              : /* Same rule in one currency: what this payment is worth
                   against bills is what arrived minus the fare. */
                forBills
          ),
          /*
            THE RATE THIS PAYMENT SETTLED AT, STORED.

            This door never wrote the column, on the reasoning that a merge can
            answer bills carrying different frozen rates and there is then no
            single answer. But three readers ask the payment for its rate and
            take null to mean "no conversion needed": the reconciliation check
            restating the fare in dollars, and the two correction paths that
            repost a reversed leg. Null made every merged shilling fare count
            as dollars — 15,000 TSh read as USD 15,000.

            Written whenever there IS one rate, which is the ordinary case, and
            left null only when the bills genuinely disagree — where the
            readers now fall back to the bill's own rate instead of to one.
          */
          ...(rateUsed ? { exchangeRate: new Prisma.Decimal(rateUsed) } : {}),
          idempotencyKey,
          method: methodForKind(mustHaveAccount(account).kind),
          reference: input.reference || null,
          note: input.note || null,
          accountId: mustHaveAccount(account).id,
          ...(input.paidAt ? { paidAt: input.paidAt } : {}),
          receivedById: user.id,
          proofs: {
            create: proofs.map((proof) => ({
              url: proof.url,
              contentType: proof.contentType,
              bytes: proof.bytes,
              filename: proof.filename,
              uploadedById: user.id,
            })),
          },
        },
      });

      for (const alloc of input.allocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            /* In the BILL's currency. An allocation says how much of a bill was
               answered, and a bill is only ever answered in its own money. */
            amount: new Prisma.Decimal(credited.get(alloc.invoiceId)!),
            createdById: user.id,
            /* Each line says the rate it used, because they need not agree. */
            ...(crossCurrency
              ? {
                  note:
                    `${input.currency} ${alloc.amount.toLocaleString()} at ` +
                    `${toNumber(
                      byId.get(alloc.invoiceId)!.exchangeRate
                    ).toLocaleString()}`,
                }
              : {}),
          },
        });
      }

      const receipt = await tx.receipt.create({
        data: {
          receiptNumber: await nextReceiptNumber(tx),
          paymentId: payment.id,
          issuedById: user.id,
        },
      });

      /* ONE line, for the money that actually arrived — not one per bill. This
         is the whole point: the statement shows one deposit and so does the
         account. */
      if (account) {
        /*
          VALUED ON THE DAY IT ARRIVED, NOT TODAY.

          This asked for the current rate and used it on a line dated whenever
          the money actually came in, so a payment entered a week late was
          booked into the register at a rate that had moved since. The
          single-bill door values the identical money at the bill's own frozen
          rate; this one now does the same when the bills agree on one, and
          otherwise falls back to what was published on the day of the payment.
        */
        const occurredAt = input.paidAt ?? payment.paidAt;
        const rate =
          rateUsed ??
          (allocatedInvoices.length === 1
            ? toNumber(allocatedInvoices[0]!.exchangeRate) || null
            : null) ??
          (await currentRateValue(occurredAt));
        if (input.currency !== "USD" && !rate) {
          throw new Error(
            "No exchange rate was published on the day this money arrived, so it cannot be valued in the register. Publish one for that date and record it again."
          );
        }
        const usdValue =
          input.currency === "USD" ? input.amount : input.amount / rate!;
        await postLedgerEntry(tx, {
          accountId: account.id,
          currency: account.currency,
          direction: "IN",
          kind: "CUSTOMER_PAYMENT",
          amount: input.amount,
          amountUsd: usdValue,
          exchangeRate: input.currency === "USD" ? null : rate,
          occurredAt,
          /* The split named on the row, same as the single-bill door — see
             the note there. */
          description:
            `${receipt.receiptNumber} — ${customer.name}, ` +
            (input.allocations.length
              ? `${input.allocations.length} bill(s) settled`
              : "deposit, no bill yet") +
            (transport > 0
              ? ` (${forBills.toLocaleString()} cargo + ${transport.toLocaleString()} transport)`
              : ""),
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: user.id,
        });
      }

      /*
        THE SECOND LEG: THE FARE LEAVING AGAIN.

        The IN leg above is the whole transfer, because the whole transfer is
        what the account received. This is the part of it that was never the
        company's, leaving whichever till or Lipa number the desk named.

        Its own kind, TRANSPORT_OUT, so it reaches neither revenue nor
        expenses and is not netted against CUSTOMER_PAYMENT when the register
        is reconciled. Posted even when the receiving account was not named:
        money leaving the till is a fact on its own.
      */
      if (transport > 0 && transportAccount) {
        const occurredAt = input.paidAt ?? payment.paidAt;
        const transportRate =
          rateUsed ??
          (allocatedInvoices.length === 1
            ? toNumber(allocatedInvoices[0]!.exchangeRate) || null
            : null) ??
          (await currentRateValue(occurredAt));
        const transportUsd =
          input.currency === "USD"
            ? transport
            : transportRate
              ? transport / transportRate
              : transport;
        await postLedgerEntry(tx, {
          accountId: transportAccount.id,
          currency: transportAccount.currency,
          direction: "OUT",
          kind: "TRANSPORT_OUT",
          amount: transport,
          amountUsd: transportUsd,
          exchangeRate: input.currency === "USD" ? null : transportRate,
          occurredAt,
          description: `${receipt.receiptNumber} — transport for ${customer.name}`,
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: user.id,
        });
      }

      const settledNumbers: string[] = [];
      for (const alloc of input.allocations) {
        const invoice = byId.get(alloc.invoiceId)!;
        const newPaid = toNumber(invoice.amountPaid) + credited.get(alloc.invoiceId)!;
        const settled = newPaid + 0.001 >= toNumber(invoice.total);

        /* Conditional on the figure this transaction read, per bill — the same
           claim the single-invoice form makes. A payment landing on any one of
           these between our read and this write unwinds the whole thing rather
           than silently losing a credit. */
        const claimed = await tx.invoice.updateMany({
          where: { id: invoice.id, amountPaid: invoice.amountPaid },
          data: {
            amountPaid: new Prisma.Decimal(newPaid),
            status: settled ? "PAID" : "PARTIALLY_PAID",
          },
        });
        if (claimed.count === 0) {
          throw new Error(
            `A payment landed on ${invoice.invoiceNumber} a moment ago. Reload and check the balances before recording again.`
          );
        }

        if (!settled) continue;
        settledNumbers.push(invoice.invoiceNumber);

        /* Cleared bills release their own cargo, and only their own. Paying one
           consignment has never released another and does not start now. */
        const shipment = await tx.shipment.findUnique({
          where: { id: invoice.shipment.id },
          select: {
            id: true,
            status: true,
            customerId: true,
            pickupNote: { select: { status: true } },
            exceptions: {
              /* BOTH DIMENSIONS, like findPickupLock. Status alone counted
                 every open case as a blocker, including ones that do not lock
                 a pickup at all — so cargo with a routine query against it sat
                 waiting for a note nobody was withholding on purpose. */
              where: {
                status: { in: PICKUP_LOCKING_STATUSES },
                type: { in: PICKUP_LOCKING_TYPES },
              },
              select: { id: true },
            },
          },
        });
        if (
          shipment &&
          shipment.status === "RECEIVED_AT_DAR" &&
          shipment.pickupNote === null &&
          shipment.exceptions.length === 0
        ) {
          const note = await tx.pickupNote.create({
            data: {
              noteNumber: await nextPickupNoteNumber(tx),
              shipmentId: shipment.id,
              customerId: shipment.customerId,
              amountPaid: new Prisma.Decimal(newPaid),
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
              note: `Payment confirmed. Pickup note ${note.noteNumber} issued.`,
              actorId: user.id,
            },
          });
        }

        await settleBatchIfClear(tx, invoice.shipment.batchId);
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.record",
          entity: "Payment",
          entityId: payment.id,
          summary: input.allocations.length
            ? `Received ${input.currency} ${input.amount.toLocaleString()} from ${customer.name} ` +
              `(${receipt.receiptNumber}) across ${input.allocations.length} bill(s)`
            : `Received ${input.currency} ${input.amount.toLocaleString()} from ${customer.name} ` +
              `(${receipt.receiptNumber}) as a deposit — no bill raised yet`,
          metadata: {
            account: account?.name ?? null,
            reference: input.reference ?? null,
            received: input.amount,
            allocated,
            /* Derived, and written down because it is the figure somebody will
               ask about: money in hand that answers no bill yet. */
            unallocated: Math.max(0, input.amount - allocated),
            proofs: proofs.length,
            settledInFull: settledNumbers,
            billCurrency,
            /* Only when the two differ — a null rate on a same-currency payment
               would read as a missing figure rather than an absent question. */
            exchangeRate: rateUsed,
            allocations: input.allocations.map((a) => ({
              invoice: byId.get(a.invoiceId)!.invoiceNumber,
              /* Both figures: what was handed over against this bill, and what
                 it settled. They are the same number until they are not. */
              tendered: a.amount,
              amount: credited.get(a.invoiceId)!,
            })),
          },
        },
        tx
      );

      return { receiptNumber: receipt.receiptNumber, settled: settledNumbers.length };
    });

    revalidatePath("/app/finance");
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/pickup-queue");
    return ok(result);
  } catch (error) {
    /* The unique index refusing a repeat, not a fault — see lib/idempotency.ts.
       Said as plainly as the findFirst guard says it, so the desk cannot tell
       which of the two caught it and does not need to. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been recorded. Reload the page — recording it again would take the same money twice."
      );
    }
    return fail(toActionError(error));
  }
}
