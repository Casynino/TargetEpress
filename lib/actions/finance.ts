"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { settleBatchIfClear } from "@/lib/batch-close";
import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  storageDaysFor,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "@/lib/fx";
import { postLedgerEntry } from "@/lib/ledger";
import { quote } from "@/lib/pricing";
import {
  nextInvoiceNumber,
  nextPickupNoteNumber,
  nextReceiptNumber,
} from "@/lib/ids";
import { companySettings } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError, paymentSchema } from "@/lib/validation";

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
      const rate = await currentRateValue();
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
          /* So re-pricing can see a waiver and leave it alone. */
          storageWaivedUsd: true,
          /* And a granted credit, whose due date it must not overwrite. */
          creditStatus: true,
          notes: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
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

      const rate = await currentRateValue();
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
          total: true,
          exchangeRate: true,
          localCurrency: true,
          notes: true,
          shipment: { select: { trackingNumber: true } },
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

      const freight = input.freightOverride ?? rateBookFreight;
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
        !can(user.role, "fx.manage")
      ) {
        throw new Error(
          "You are not authorised to change the exchange rate on an invoice."
        );
      }

      const rate = input.exchangeRate ?? currentRate;
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
        },
      });
      if (adjusted.count === 0) {
        throw new Error(
          "A payment landed on this bill a moment ago. Reload and adjust it against the fresh balance."
        );
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

  const parsed = paymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
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
          shipment: { select: { id: true, trackingNumber: true, batchId: true } },
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

      let credited = input.amount;
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
            ? input.amount / rateUsed
            : input.amount * rateUsed;
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
            : `${tenderedCurrency} ${input.amount.toLocaleString()} is ${invoice.currency} ${credited.toLocaleString()} at this invoice's rate — more than the ${invoice.currency} ${outstanding.toLocaleString()} still outstanding.`
        );
      }

      // Where the money landed, if the desk said. Optional by design — see
      // paymentSchema — but if an account IS named it has to be able to hold
      // this money: shillings do not go into a dollar account, and an account
      // that quietly accepts the wrong currency is how a balance stops meaning
      // anything.
      let account: {
        id: string;
        name: string;
        currency: string;
        active: boolean;
      } | null = null;
      if (input.accountId) {
        account = await tx.companyAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true, name: true, currency: true, active: true },
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

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(input.amount),
          currency: tenderedCurrency,
          creditedAmount: new Prisma.Decimal(credited),
          exchangeRate: rateUsed === null ? null : new Prisma.Decimal(rateUsed),
          method: input.method,
          reference: input.reference || null,
          note: input.note || null,
          accountId: account?.id ?? null,
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
        // `credited` is already the payment restated in the invoice's currency,
        // so when the bill is in dollars — which every bill in this system is —
        // it is exactly the figure wanted here.
        const usdValue =
          invoice.currency === "USD"
            ? credited
            : tenderedCurrency === "USD"
              ? input.amount
              : rateUsed ?? invoiceRate
                ? input.amount / (rateUsed ?? invoiceRate)!
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
          description: `${receipt.receiptNumber} — ${invoice.invoiceNumber} for ${invoice.shipment.trackingNumber}`,
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
            pickupNote: { select: { id: true, status: true } },
            // Any case that blocks pickup, not just a missing shipment.
            //
            // This filtered on status "OPEN" and type MISSING_SHIPMENT, which
            // was two holes at once. A case moved to UNDER_INVESTIGATION stops
            // matching "OPEN", so the gate opened and a pickup note could be
            // issued for cargo somebody was actively hunting for — the exact
            // thing the owner said must never happen. And damaged, wrong-item
            // and held cargo were never covered at all.
            exceptions: {
              where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
              select: { id: true },
            },
          },
        });

        const alreadyActive = shipment?.pickupNote?.status === "ACTIVE";
        const blocked = (shipment?.exceptions.length ?? 0) > 0;
        const atDar = shipment?.status === "RECEIVED_AT_DAR";

        if (shipment && !alreadyActive && !blocked && atDar) {
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
            method: input.method,
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
            where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
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
        select: { id: true, name: true, currency: true, active: true },
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
        data: { accountId: account.id },
      });

      // The line that was never written, written now — at the rate and on the
      // date the money actually moved, not today's.
      const usdValue =
        payment.invoice.currency === "USD"
          ? toNumber(payment.creditedAmount ?? payment.amount)
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
        description: `${payment.receipt?.receiptNumber ?? "Payment"} — ${payment.invoice.invoiceNumber} for ${payment.invoice.shipment.trackingNumber}`,
        sourceEntity: "Payment",
        sourceId: payment.id,
        paymentId: payment.id,
        recordedById: user.id,
      });

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
        select: { trackingNumber: true, ...selectText("description") },
      },
    },
  });

  return invoices.map((inv) => {
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
    };
  });
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
