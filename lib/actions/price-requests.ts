"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { LOCAL_CURRENCY, toLocal } from "@/lib/fx";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";
import { adjustInvoice } from "@/lib/actions/finance";

/**
 * A PRICE THE COUNTER AGREED, SENT UP FOR FINANCE TO AGREE TOO.
 *
 * Customer Care settles a figure with a customer on the phone. Moving the
 * freight on a bill is giving money away, and the owner put that decision with
 * Finance, the manager and himself — so the freight box was simply locked to
 * the desk that was having the conversation, and the call ended with "someone
 * will ring you back".
 *
 * Both things are now true at once. The desk types the number they agreed and
 * it becomes a REQUEST. NOTHING ON THE BILL MOVES: the customer still owes the
 * confirmed figure, every screen still shows it, and the cargo stays put until
 * somebody with the authority rules.
 *
 * @see lib/actions/finance.ts adjustInvoice — the one door a price goes through.
 */

/** Bills nobody may re-price: settled, given up on, or cancelled. */
const NOT_RE_PRICEABLE = ["PAID", "WRITTEN_OFF", "VOID", "CANCELLED"];

const requestSchema = z.object({
  invoiceId: z.string().trim().min(1, "Missing invoice."),
  /* Empty means "leave the freight alone". Asking for the rate book's figure
     back is the checkbox below, because an empty box cannot say the difference
     between leaving a price and deleting one. */
  freightOverride: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "That freight amount is not valid."
    ),
  clearsFreightOverride: z
    .string()
    .trim()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  freightRateOverride: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "That rate is not valid."
    ),
  storageCharge: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "That storage amount is not valid."
    ),
  otherCharges: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "That charge is not a valid amount."
    ),
  /* NOT optional, unlike the reason on an edit Finance makes itself. Somebody
     who was not on the call has to rule on this, and a request with no reason
     can only be guessed at. */
  /* Required only when a money figure actually moved — see below. A desk
     correcting a typo in a note is not asking Finance for anything. */
  reason: z.string().trim().optional(),
  /*
    THE TWO THINGS THIS DESK MAY SIMPLY DO.

    They ride on the same form and the same button, because splitting them out
    would mean a second form posting to adjustInvoice — and that action writes
    the WHOLE bill, so a small form omitting the discount would zero it. Saved
    here directly instead: what the desk may change, changes; what it may not,
    is asked for.
  */
  notes: z.string().trim().optional(),
  exchangeRate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 100 && v <= 100_000),
      "That rate looks wrong for USD→TZS. Check the number of digits."
    ),
});

export async function requestPriceChange(
  _prev: ActionResult<{ proposedTotal: number; queued: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ proposedTotal: number; queued: boolean }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.priceRequest");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = requestSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  if (input.freightOverride !== null && input.clearsFreightOverride) {
    return fail(
      "Either ask for a freight figure or ask to go back to the rate book — not both."
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          freightCost: true,
          freightOverride: true,
          storageCharge: true,
          otherCharges: true,
          discount: true,
          notes: true,
          exchangeRate: true,
          localCurrency: true,
          shipment: { select: { trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("That bill no longer exists.");
      if (NOT_RE_PRICEABLE.includes(invoice.status)) {
        throw new Error(
          `${invoice.invoiceNumber} is ${invoice.status.toLowerCase().replace("_", " ")}, so its price cannot be changed.`
        );
      }

      /*
        WHAT THE BILL WOULD COME TO, WORKED OUT HERE AND STORED.

        The queue shows Finance the difference without loading the rate book
        for every waiting row, and the desk sees the figure before they send
        it. Every term is the FINAL amount, never a delta: a delta applied days
        later against a bill that has since moved lands on a number nobody
        agreed.
      */
      const freightNow =
        invoice.freightOverride === null
          ? toNumber(invoice.freightCost)
          : toNumber(invoice.freightOverride);
      const freightAsked = input.clearsFreightOverride
        ? toNumber(invoice.freightCost)
        : (input.freightOverride ?? freightNow);
      const storageAsked = input.storageCharge ?? toNumber(invoice.storageCharge);
      const otherAsked = input.otherCharges ?? toNumber(invoice.otherCharges);
      const proposedTotal =
        Math.round(
          (freightAsked + storageAsked + otherAsked - toNumber(invoice.discount)) * 100
        ) / 100;

      if (proposedTotal < 0) {
        throw new Error("That would take the bill below zero.");
      }
      /* The same refusal adjustInvoice makes, made here so the desk is told at
         the counter rather than Finance discovering it days later on a request
         they cannot agree to. Handing money back is a refund, not a price. */
      const paid = toNumber(invoice.amountPaid);
      if (proposedTotal < paid - 0.005) {
        throw new Error(
          `${invoice.currency} ${paid.toFixed(2)} has already been paid against ${invoice.invoiceNumber}, so it cannot be re-priced to ${proposedTotal.toFixed(2)}. Handing the difference back is a refund.`
        );
      }

      /*
        WHAT THE DESK MAY CHANGE, CHANGES NOW.

        The note and the rate on one bill are this desk's already — the owner
        separated the bill's rate from the rate book deliberately, because
        agreeing what today's shillings are worth is the conversation they are
        having on the phone. Neither moves the dollar total, so neither waits
        on anybody. The rate is guarded again here rather than trusted from the
        form, because an unrendered field is not a permission.
      */
      const rateAsked = input.exchangeRate;
      const rateMoved =
        rateAsked !== null &&
        Math.abs(rateAsked - (toNumber(invoice.exchangeRate) || 0)) > 0.000001;
      if (rateMoved && !can(user.role, "invoice.rate")) {
        throw new Error(
          "You are not authorised to change the exchange rate on an invoice."
        );
      }
      const noteAsked = input.notes?.length ? input.notes : null;
      const noteMoved = noteAsked !== (invoice.notes || null);

      if (rateMoved || noteMoved) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            ...(noteMoved ? { notes: noteAsked } : {}),
            ...(rateMoved && rateAsked !== null
              ? {
                  exchangeRate: new Prisma.Decimal(rateAsked),
                  localCurrency: invoice.localCurrency ?? LOCAL_CURRENCY,
                  /* The dollar total is untouched, so the shilling figure is
                     simply restated at the rate just agreed. */
                  totalLocal: new Prisma.Decimal(
                    toLocal(toNumber(invoice.total), rateAsked)
                  ),
                }
              : {}),
          },
        });
        await recordAudit({
          actor: user,
          action: "invoice.edit",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `Updated ${invoice.invoiceNumber}${rateMoved ? ` at ${rateAsked} per USD` : ""}`,
          metadata: {
            rateFrom: toNumber(invoice.exchangeRate),
            rateTo: rateAsked,
            noteChanged: noteMoved,
          },
        });
      }

      /*
        NOTHING WAS ASKED FOR, SO NOTHING IS QUEUED.

        Opening the panel to fix a note must not put a price in front of
        Finance — a queue that fills with rows saying "no change" is a queue
        nobody reads.
      */
      const moneyMoved =
        Math.abs(proposedTotal - toNumber(invoice.total)) > 0.005 ||
        Math.abs(freightAsked - freightNow) > 0.005;
      if (!moneyMoved) {
        return { invoiceId: invoice.id, proposedTotal, queued: false };
      }
      if (!input.reason || input.reason.length < 3) {
        throw new Error(
          "Say what was agreed and with whom. Finance reads this before agreeing the price."
        );
      }

      /*
        ONE WAITING REQUEST PER BILL.

        Checked here for the message and enforced by a partial unique index in
        the database, because two desks sending at the same moment both read
        "none waiting" and both insert. The index is the thing that actually
        holds; this is what makes the refusal readable.
      */
      const waiting = await tx.invoicePriceRequest.findFirst({
        where: { invoiceId: invoice.id, status: "PENDING" },
        select: { id: true },
      });
      if (waiting) {
        throw new Error(
          `${invoice.invoiceNumber} already has a price waiting on Finance. Take that one back first.`
        );
      }

      const request = await tx.invoicePriceRequest.create({
        data: {
          invoiceId: invoice.id,
          freightOverride:
            input.freightOverride === null
              ? null
              : new Prisma.Decimal(input.freightOverride),
          clearsFreightOverride: input.clearsFreightOverride,
          freightRateOverride:
            input.freightRateOverride === null
              ? null
              : new Prisma.Decimal(input.freightRateOverride),
          storageCharge:
            input.storageCharge === null
              ? null
              : new Prisma.Decimal(input.storageCharge),
          otherCharges:
            input.otherCharges === null
              ? null
              : new Prisma.Decimal(input.otherCharges),
          reason: input.reason,
          currency: invoice.currency,
          totalAtTime: invoice.total,
          freightAtTime: new Prisma.Decimal(freightNow),
          proposedTotal: new Prisma.Decimal(proposedTotal),
          requestedById: user.id,
        },
        select: { id: true },
      });

      await recordAudit({
        actor: user,
        action: "invoice.priceRequested",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Asked Finance to price ${invoice.shipment?.trackingNumber ?? invoice.invoiceNumber} at ${invoice.currency} ${proposedTotal.toFixed(2)}`,
        metadata: {
          requestId: request.id,
          invoiceNumber: invoice.invoiceNumber,
          from: toNumber(invoice.total),
          to: proposedTotal,
          freightFrom: freightNow,
          freightTo: freightAsked,
          reason: input.reason,
        },
      });

      return { invoiceId: invoice.id, proposedTotal, queued: true };
    });

    revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    revalidatePath("/app/finance");
    revalidatePath("/app/collections/follow-up");
    return ok({ proposedTotal: result.proposedTotal, queued: result.queued });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * FINANCE RULES ON IT — AND THE PRICE MOVES THROUGH THE ORDINARY DOOR.
 *
 * Agreeing re-submits the requested figures through `adjustInvoice` under the
 * APPROVER's own session. One code path, one set of guards, one audit line, and
 * the name against the change is the name of whoever agreed it — not the desk
 * that asked. A second path that also moved a price would be the one missing
 * the check the first one has.
 *
 * Every figure adjustInvoice is not being asked to change is sent as it stands
 * today, because that action writes the whole bill: a missing `notes` clears
 * the note, and a missing discount zeroes it.
 */
export async function decidePriceChange(
  _prev: ActionResult<{ approved: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ approved: boolean }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.discount");
  } catch (error) {
    return fail(toActionError(error));
  }

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("decisionNote") ?? "").trim();
  if (!requestId) return fail("Missing request.");
  if (decision !== "APPROVE" && decision !== "REJECT") {
    return fail("Say whether the price is agreed or refused.");
  }
  if (decision === "REJECT" && note.length < 3) {
    return fail("Say why, so the desk can tell the customer.");
  }

  const request = await prisma.invoicePriceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedById: true,
      invoiceId: true,
      freightOverride: true,
      clearsFreightOverride: true,
      freightRateOverride: true,
      storageCharge: true,
      otherCharges: true,
      reason: true,
      totalAtTime: true,
      proposedTotal: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          discount: true,
          otherCharges: true,
          storageCharge: true,
          exchangeRate: true,
          notes: true,
          freightRateOverride: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
    },
  });
  if (!request) return fail("That request no longer exists.");
  if (request.status !== "PENDING") {
    return fail("Somebody has already ruled on this price.");
  }

  /*
    NOBODY AGREES THEIR OWN PRICE.

    Checked against the PERSON, not the department — the same rule the credit
    book runs on. A manager who holds both permissions could otherwise send a
    price up and sign it off in the same breath, which is the one thing this
    whole flow exists to prevent.
  */
  if (request.requestedById && request.requestedById === user.id) {
    return fail(
      "You asked for this price, so somebody else has to agree it."
    );
  }

  /*
    THE BILL MUST BE WHAT IT WAS WHEN THE DESK ASKED.

    Somebody else editing the invoice in between means the figure Finance is
    looking at is not the figure that would land. The requested amounts are
    absolute, so applying them would still be deterministic — but the TOTAL
    would not be the one on the request, and agreeing to a number you were not
    shown is exactly the failure this flow prevents.
  */
  if (
    Math.abs(toNumber(request.invoice.total) - toNumber(request.totalAtTime)) >
    0.005
  ) {
    return fail(
      `${request.invoice.invoiceNumber} has changed since this was sent up. Ask the desk to send the price again against the bill as it stands.`
    );
  }

  if (decision === "REJECT") {
    const refused = await prisma.invoicePriceRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
    if (refused.count === 0) return fail("Somebody has already ruled on this price.");

    await recordAudit({
      actor: user,
      action: "invoice.priceRefused",
      entity: "Invoice",
      entityId: request.invoiceId,
      summary: `Refused the price asked for ${request.invoice.shipment?.trackingNumber ?? request.invoice.invoiceNumber}`,
      metadata: {
        requestId: request.id,
        asked: toNumber(request.proposedTotal),
        stands: toNumber(request.invoice.total),
        reason: request.reason,
        note,
      },
    });
    revalidatePath(`/app/finance/invoices/${request.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    return ok({ approved: false });
  }

  /*
    CLAIMED BEFORE THE MONEY MOVES.

    The row is taken first, so two people pressing Agree at the same moment
    cannot both go on to adjust the bill — the second's updateMany matches
    nothing. If the adjustment then refuses, the claim is handed back below and
    the request is waiting again, which is the honest state: nothing moved.
  */
  const claimed = await prisma.invoicePriceRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "APPROVED",
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: note || null,
    },
  });
  if (claimed.count === 0) return fail("Somebody has already ruled on this price.");

  const invoice = request.invoice;
  const form = new FormData();
  form.set("invoiceId", invoice.id);
  /* Sent as they stand: adjustInvoice writes the whole bill, so anything left
     out is not left alone, it is cleared. */
  form.set("discount", String(toNumber(invoice.discount)));
  form.set(
    "otherCharges",
    String(
      request.otherCharges === null
        ? toNumber(invoice.otherCharges)
        : toNumber(request.otherCharges)
    )
  );
  form.set(
    "storageCharge",
    String(
      request.storageCharge === null
        ? toNumber(invoice.storageCharge)
        : toNumber(request.storageCharge)
    )
  );
  if (invoice.exchangeRate !== null) {
    form.set("exchangeRate", String(toNumber(invoice.exchangeRate)));
  }
  if (invoice.notes) form.set("notes", invoice.notes);
  if (request.clearsFreightOverride) {
    /* Empty clears the agreed price and the rate book stands again — which is
       what the desk asked for. */
    form.set("freightOverride", "");
    form.set("freightRateOverride", "");
  } else if (request.freightOverride !== null) {
    form.set("freightOverride", String(toNumber(request.freightOverride)));
    if (request.freightRateOverride !== null) {
      form.set("freightRateOverride", String(toNumber(request.freightRateOverride)));
    }
  } else if (invoice.freightRateOverride !== null) {
    form.set("freightRateOverride", String(toNumber(invoice.freightRateOverride)));
  }
  form.set("freightOverrideReason", request.reason);

  const applied = await adjustInvoice(undefined, form);
  if (!applied.ok || !applied.data) {
    /* Nothing moved, so the request goes back to waiting rather than standing
       as agreed against a bill that never changed. */
    await prisma.invoicePriceRequest.updateMany({
      where: { id: request.id, status: "APPROVED", decidedById: user.id },
      data: {
        status: "PENDING",
        decidedById: null,
        decidedAt: null,
        decisionNote: null,
      },
    });
    return fail(applied.ok ? "The bill did not change." : applied.error);
  }

  await recordAudit({
    actor: user,
    action: "invoice.priceAgreed",
    entity: "Invoice",
    entityId: request.invoiceId,
    summary: `Agreed the price asked for ${invoice.shipment?.trackingNumber ?? invoice.invoiceNumber}: ${toNumber(request.totalAtTime).toFixed(2)} → ${applied.data.total.toFixed(2)}`,
    metadata: {
      requestId: request.id,
      from: toNumber(request.totalAtTime),
      to: applied.data.total,
      asked: toNumber(request.proposedTotal),
      reason: request.reason,
      note: note || null,
    },
  });

  revalidatePath(`/app/finance/invoices/${request.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  revalidatePath("/app/finance");
  return ok({ approved: true });
}

/**
 * The desk taking its own request back — a customer rings again, or the figure
 * was typed wrong. Withdrawing is not deciding, so this is the one thing the
 * asker may do to their own request.
 */
export async function withdrawPriceRequest(
  _prev: ActionResult<{ withdrawn: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ withdrawn: boolean }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.priceRequest");
  } catch (error) {
    return fail(toActionError(error));
  }

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return fail("Missing request.");

  const request = await prisma.invoicePriceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, requestedById: true, invoiceId: true },
  });
  if (!request) return fail("That request no longer exists.");
  if (request.status !== "PENDING") {
    return fail("That price has already been ruled on.");
  }

  const withdrawn = await prisma.invoicePriceRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "WITHDRAWN", decidedAt: new Date() },
  });
  if (withdrawn.count === 0) {
    return fail("Finance ruled on this a moment ago. Reload to see what they said.");
  }

  await recordAudit({
    actor: user,
    action: "invoice.priceRequestWithdrawn",
    entity: "Invoice",
    entityId: request.invoiceId,
    summary: "Took back a price that was waiting on Finance",
    metadata: { requestId: request.id },
  });

  revalidatePath(`/app/finance/invoices/${request.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  return ok({ withdrawn: true });
}
