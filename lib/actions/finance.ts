"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  storageDaysFor,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
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
  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail("Missing shipment.");

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
          arrivedAt: true,
          deliveredAt: true,
          invoice: { select: { id: true, amountPaid: true, invoiceNumber: true } },
        },
      });
      if (!shipment) throw new Error("Shipment not found.");

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
      const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
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
      const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
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
          // Payable before the cargo is released — which is what
          // issuePickupNote already enforces, so the terms say what is true.
          dueDate: new Date(),
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
          otherCharges: true,
          discount: true,
          amountPaid: true,
          exchangeRate: true,
          localCurrency: true,
          notes: true,
          shipment: { select: { trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("That invoice no longer exists.");

      if (toNumber(invoice.amountPaid) > 0) {
        throw new Error(
          `Money has already been received against ${invoice.invoiceNumber} — it can no longer be edited.`
        );
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
      const storage = toNumber(invoice.storageCharge);
      const total = freight + storage + input.otherCharges - input.discount;
      if (total < 0) {
        throw new Error("The discount is larger than the rest of the invoice.");
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

      await tx.invoice.update({
        where: { id: invoice.id },
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
          total: new Prisma.Decimal(total),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          localCurrency: invoice.localCurrency ?? LOCAL_CURRENCY,
          totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
          notes: input.notes || null,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "invoice.adjust",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `Adjusted ${invoice.invoiceNumber} (${invoice.shipment.trackingNumber}) ` +
            `to ${total.toFixed(2)}` +
            (discountChanged ? ` — discount ${input.discount.toFixed(2)}` : ""),
          metadata: {
            before: {
              discount: toNumber(invoice.discount),
              otherCharges: toNumber(invoice.otherCharges),
              exchangeRate:
                invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate),
              notes: invoice.notes,
            },
            after: {
              discount: input.discount,
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
    revalidatePath("/app/support/follow-up");
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
          shipment: { select: { id: true, trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status === "VOID") throw new Error("This invoice is void.");
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

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: new Prisma.Decimal(newPaid),
          status: settled ? "PAID" : "PARTIALLY_PAID",
        },
      });

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
          },
        },
        tx
      );

      return receipt.receiptNumber;
    });

    revalidatePath("/app/finance");
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/finance/payments");
    revalidatePath("/app/finance/pickup-notes");
    revalidatePath("/app/release");
    return ok({ receiptNumber, pickupNoteNumber: issuedNote });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * The gate between money and cargo. A pickup note is the only thing that moves
 * a shipment to READY_FOR_PICKUP, and only Finance can issue one.
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
            select: { id: true, status: true, total: true, amountPaid: true },
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
            ? `A pickup note (${existing.noteNumber}) is already active for this shipment.`
            : existing.status === "USED"
              ? `Pickup note ${existing.noteNumber} was already used to collect this cargo.`
              : `Pickup note ${existing.noteNumber} was cancelled. This shipment cannot be issued a second note — reopen the cancelled one or raise it with the CEO.`
        );
      }
      if (shipment.status !== "RECEIVED_AT_DAR") {
        throw new Error(
          "Cargo must be checked in at the Dar warehouse before a pickup note can be issued."
        );
      }
      if (shipment.exceptions.length > 0) {
        throw new Error(
          "This shipment is flagged as missing. Resolve the exception first."
        );
      }
      if (!shipment.invoice) throw new Error("Raise an invoice first.");
      if (shipment.invoice.status !== "PAID") {
        const outstanding =
          toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid);
        throw new Error(
          `${shipment.currency} ${outstanding.toLocaleString()} is still outstanding on this invoice.`
        );
      }

      const note = await tx.pickupNote.create({
        data: {
          noteNumber: await nextPickupNoteNumber(tx),
          shipmentId: shipment.id,
          customerId: shipment.customerId,
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
          note: `Payment confirmed. Pickup note ${note.noteNumber} issued.`,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "pickupNote.issue",
          entity: "PickupNote",
          entityId: note.id,
          summary: `Issued ${note.noteNumber} for ${shipment.trackingNumber}`,
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
