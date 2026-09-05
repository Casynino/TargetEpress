"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { nextSubmissionNumber } from "@/lib/ids";
import { methodForKind } from "@/lib/accounts";
import {
  idempotencyKeyFrom,
  isRepeatSubmission,
} from "@/lib/idempotency";
import { prisma, type TxClient } from "@/lib/prisma";
import { pendingClaimWhere } from "@/lib/claimed";
import { isCollectable, notPayableMessage } from "@/lib/payable";
import { filesFrom, putDocument } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { toNumber } from "@/lib/format";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { customerPaymentSchema, firstError } from "@/lib/validation";

/**
 * Collections: what Customer Support does, and what Finance does after them.
 *
 * The desk that rings customers is not the desk that keeps the books. Support
 * collects the customer's evidence — the M-Pesa screenshot, the bank slip — and
 * hands it up. Nothing they do moves a shilling: a submission is a claim, and
 * a claim is not money.
 *
 * Finance then agrees or does not. Agreeing calls recordPayment, the same path
 * Finance has always used at the counter, which is why the workflow the owner
 * asked us never to touch is untouched here. This module is a step in front of
 * it, never a replacement: everything about how a payment is recorded, how a
 * receipt is numbered, how the ledger is posted and when a pickup note is minted
 * still lives in lib/actions/finance.ts and is reached, not reimplemented.
 */

/**
 * The caller's address, for the audit trail.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded header is
 * the only honest answer — and it is a list, oldest client first. Treated as
 * advisory: a header can be forged, so it is recorded as evidence of what the
 * request claimed, never used to decide anything.
 */
async function callerIp() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return list.get("x-real-ip") ?? null;
}

const submissionSchema = z.object({
  invoiceId: z.string().min(1, "Say which bill this settles."),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter what the customer sent."),
  currency: z.enum(["TZS", "USD"]),
  /* Where the customer says it went. Required — see the note on
     PaymentSubmission.accountId. Support can answer it because the proof
     they are looking at names the destination, and Finance still decides it
     for real on the way through. */
  accountId: z.string().trim().min(1, "Say which account the money landed in."),
  /*
    "THE CUSTOMER PAID THE CARGO PLUS THE TRANSPORT."

    Support is the desk on the phone, so Support is the desk that hears it, and
    the claim is where it has to be written down. Without it the figure Support
    sends up is simply larger than the bill, and Finance is looking at what
    reads as an overpayment with no explanation — they send back a correct
    claim, or agree a wrong one.

    Optional and zero by default, because almost no claim has transport in it.
  */
  transport: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine(
      (v) => Number.isFinite(v) && v >= 0,
      "The transport has to be a number, or nothing at all."
    ),
  /* Where Support expects it to be paid out of. Finance can name a different
     account when they verify, exactly as they can with the one above. */
  transportSourceId: z.string().trim().optional(),
  /* The desk looked at a fare bigger than the cargo and said it was right.
     See paymentSchema in lib/validation.ts for why the ceiling had to move
     off the total and onto the cargo half. */
  transportConfirmed: z
    .string()
    .trim()
    .optional()
    .transform((v) => v === "1" || v === "true" || v === "on"),
  /*
    "THE CUSTOMER SENT A LITTLE LESS, AND THE REST IS NOT COMING."

    The other half of the same conversation the transport fields carry. A bill
    of 36,450 answered by 36,000 leaves 450 that is a rounding at the far end
    or the bank's fee, and Support — the desk actually on the phone — is the
    desk that hears so. Without somewhere to write it down, the claim Support
    sends up is simply short, and Finance cannot tell "still being chased"
    from "settled, clear the last of it".

    A CLAIM, not a decision. Finance ticks it on the verify screen and the
    adjustment is written there, under their name. This is the answer their
    screen opens with.
  */
  clearShortfall: z
    .string()
    .trim()
    .optional()
    .transform((v) => v === "1" || v === "true" || v === "on"),
  // The one thing this desk genuinely has to type: the code off the customer's
  // message. Everything else is already on the invoice.
  /* Expected on screen, optional here: cash across the counter has no code,
     and refusing the record loses the payment rather than the reference. */
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/**
 * The account a claim names has to be one that could really have received it.
 *
 * Same three checks recordPayment makes before it will touch an account: it
 * exists, it is open, and it holds the currency the money is in. A claim that
 * names a dollar account for a shilling transfer is one Finance would have to
 * refuse anyway, and refusing it here means Support finds out while the
 * customer is still on the phone.
 */
async function claimedAccount(
  tx: TxClient,
  accountId: string,
  currency: string
) {
  const account = await tx.companyAccount.findUnique({
    where: { id: accountId },
    /* kind, because the method column is now read off it rather than asked
       for — see methodForKind. */
    select: { id: true, name: true, kind: true, currency: true, active: true },
  });
  if (!account) throw new Error("That account no longer exists.");
  if (!account.active) throw new Error(`${account.name} has been archived.`);
  if (account.currency !== currency) {
    throw new Error(
      `${account.name} is a ${account.currency} account, so ${currency} could not have landed in it.`
    );
  }
  return account;
}

/**
 * The account the transport will be paid out of.
 *
 * The customer may send the whole thing anywhere — a bank, a till, cash across
 * the counter — but the transport leaves the business by one of two routes and
 * no others: the Lipa number or the office cash. That is the owner's rule, and
 * it exists so the money going out to drivers can be counted against a till
 * and a tin rather than hunted through a bank statement.
 *
 * Checked here rather than only at verification, so a desk that picks the
 * wrong one finds out while the customer is still on the phone instead of
 * having the claim sent back a day later.
 */
async function claimedTransportSource(
  tx: TxClient,
  transportSourceId: string | undefined,
  transport: number,
  currency: string
) {
  if (transport <= 0) return null;
  if (!transportSourceId) {
    throw new Error(
      "Say where the transport is being paid from — the Lipa number or the office cash."
    );
  }
  const account = await tx.companyAccount.findUnique({
    where: { id: transportSourceId },
    select: { id: true, name: true, kind: true, currency: true, active: true },
  });
  if (!account) throw new Error("That transport account no longer exists.");
  if (!account.active) throw new Error(`${account.name} has been archived.`);
  if (account.kind !== "CASH" && account.kind !== "MOBILE_MONEY") {
    throw new Error(
      `Transport is settled in cash or off the Lipa number. ${account.name} is a bank account.`
    );
  }
  if (account.currency !== currency) {
    throw new Error(
      `${account.name} is a ${account.currency} account, so the transport cannot be paid out of it in ${currency}.`
    );
  }
  return account;
}

/**
 * Support hands a customer's payment up to Finance.
 *
 * Writes nothing to the invoice, the ledger or any balance. The customer says
 * they paid; this records that they said so, with their evidence attached, and
 * puts it in front of the desk that can check.
 */
export async function submitPaymentForVerification(
  _prev: ActionResult<{ submissionNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ submissionNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.submit");
  } catch (error) {
    return fail(toActionError(error));
  }

  /* This request's own identity, not part of what a claim IS. See
     lib/idempotency.ts — two tabs submitting the same claim both pass the
     duplicate check, which reads before it writes; the unique index does not. */
  const idempotencyKey = idempotencyKeyFrom(formData);

  const parsed = submissionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const ip = await callerIp();

  /**
   * The customer's evidence. The whole point of the record.
   *
   * Uploaded before the transaction opens, exactly as recordPayment does it: a
   * file crossing the network must not hold a row lock on an invoice, and a
   * proof that fails to store has to fail the submission loudly rather than
   * leaving Finance a claim with evidence nobody can find.
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
    Evidence is expected, never enforced.

    A submission with nothing attached IS weaker — Finance is agreeing to it on
    somebody's word — and the form says so plainly. But it does not block any
    more: cash handed across the counter has no screenshot and no code, and a
    refusal there does not produce evidence, it produces a payment that never
    gets recorded. The verification step is where a thin submission gets
    challenged, and it still has who submitted it and when.
  */

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          customerId: true,
          shipment: { select: { trackingNumber: true, status: true } },
          customer: { select: { name: true } },
        },
      });
      if (!invoice) throw new Error("That bill no longer exists.");

      // A draft is the system's price, not a bill. Collecting against one asks
      // a customer for a figure this business has not agreed to yet.
      if (invoice.status === "DRAFT") {
        throw new Error(
          `${invoice.invoiceNumber} is still a draft. Finance has to confirm the price before anything can be collected against it.`
        );
      }
      if (invoice.status === "PAID") {
        throw new Error(`${invoice.invoiceNumber} is already settled.`);
      }
      /* And where the cargo is. A claim is a customer being asked to send
         money, so it is refused on the same terms as taking it. */
      if (!isCollectable(invoice.shipment.status)) {
        throw new Error(notPayableMessage(invoice.shipment.trackingNumber));
      }

      // One claim at a time per bill. Two pending submissions against one
      // invoice is two people ringing the same customer and Finance verifying
      // the same money twice.
      const pending = await tx.paymentSubmission.findFirst({
        /* A merged claim covering this bill counts too — see pendingClaimWhere. */
        where: pendingClaimWhere(invoice.id),
        select: { submissionNumber: true },
      });
      if (pending) {
        throw new Error(
          `${pending.submissionNumber} is already with Finance for this bill. Wait for it to be checked.`
        );
      }

      const account = await claimedAccount(tx, input.accountId, input.currency);
      /*
        The transport cannot be more than what was sent.

        Said here rather than only on the form, because the form is not the
        only way in — and because a claim whose transport swallows the whole
        transfer settles nothing against the bill while looking, on the queue,
        exactly like one that does.
      */
      if (input.transport > input.amount + 0.001) {
        throw new Error(
          `The transport (${input.currency} ${input.transport.toLocaleString()}) is more than the customer sent (${input.currency} ${input.amount.toLocaleString()}).`
        );
      }
      /*
        AND MEASURED AGAINST THE CARGO, WHICH IS WHERE IT SHOWS.

        The screens make the total the bill plus the fare, so "the fare is
        less than the total" is now true by construction and refuses nothing.
        An extra nought would sail through and be handed to Finance as a claim
        that looks ordinary. Compared to the half that settles the bill it
        stands out, and the desk can still say it is right.
      */
      const forBill = Math.round((input.amount - input.transport) * 100) / 100;
      if (input.transport > forBill + 0.001 && !input.transportConfirmed) {
        throw new Error(
          `The transport (${input.currency} ${input.transport.toLocaleString()}) is more than the ` +
            `${input.currency} ${forBill.toLocaleString()} going to the bill. ` +
            `Check the figure — if it is right, tick to confirm it.`
        );
      }
      const transportSource = await claimedTransportSource(
        tx,
        input.transportSourceId,
        input.transport,
        input.currency
      );

      const submission = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          idempotencyKey,
          invoiceId: invoice.id,
          /* Named on both shapes of claim, as the schema says it is. Without
             it a single-bill claim belonged to no customer, so a merge could
             not carry it across and the customer's own page could not find
             what they had been chased for. */
          customerId: invoice.customerId,
          amount: new Prisma.Decimal(input.amount),
          /* The whole transfer stays in `amount`. This is the part of it the
             customer was paying for the delivery, and it is what stops the
             figure above reading as an overpayment on the verify screen. */
          transportAmount: new Prisma.Decimal(input.transport),
          transportSourceId: transportSource?.id ?? null,
          /* What Support was told about the gap. Carried, never acted on
             here — no payment exists yet, so there is nothing to clear. */
          clearShortfall: input.clearShortfall,
          currency: input.currency,
          method: methodForKind(account.kind),
          accountId: account.id,
          reference: input.reference || null,
          note: input.note || null,
          submittedById: user.id,
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
        select: { id: true, submissionNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.submitted",
          entity: "PaymentSubmission",
          entityId: submission.id,
          summary:
            `${submission.submissionNumber} — ${input.currency} ${input.amount.toLocaleString()} claimed against ${invoice.invoiceNumber} for ${invoice.customer.name}` +
            (input.transport > 0
              ? ` (includes ${input.currency} ${input.transport.toLocaleString()} transport)`
              : ""),
          metadata: {
            ip,
            department: user.role,
            invoiceNumber: invoice.invoiceNumber,
            trackingNumber: invoice.shipment.trackingNumber,
            reference: input.reference || null,
            proofs: proofs.length,
            transport: input.transport || null,
            transportFrom: transportSource?.name ?? null,
          },
        },
        tx
      );

      return submission;
    });

    revalidatePath("/app/support");
    revalidatePath("/app/collections");
    revalidatePath("/app/finance/payments");
    return { ok: true, data: { submissionNumber: result.submissionNumber } };
  } catch (error) {
    /* The unique index refusing a repeat, not a fault. See lib/idempotency.ts. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been sent to Finance. Reload the page — sending it again would claim the same money twice."
      );
    }
    return fail(toActionError(error));
  }
}

const decisionSchema = z.object({
  submissionId: z.string().min(1),
  reason: z.string().trim().optional(),
});

/**
 * Finance says no.
 *
 * The fault is worth writing — Support rings the customer with it, and
 * "rejected" on its own is a message nobody can act on — but it is asked for
 * and no longer demanded. A desk clearing a queue of duplicates was typing the
 * same sentence ten times to get through it, and that is not a record either.
 *
 * Nothing is deleted: the claim and the refusal both stay where they were.
 */
export async function rejectPaymentSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("payment.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = decisionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const reason = parsed.data.reason?.trim() || null;
  const ip = await callerIp();

  try {
    await prisma.$transaction(async (tx) => {
      const submission = await tx.paymentSubmission.findUnique({
        where: { id: parsed.data.submissionId },
        select: {
          id: true,
          submissionNumber: true,
          status: true,
          invoice: { select: { invoiceNumber: true } },
        },
      });
      if (!submission) throw new Error("That submission no longer exists.");
      if (submission.status !== "PENDING") {
        throw new Error(
          `${submission.submissionNumber} has already been dealt with.`
        );
      }

      /* Re-stated as a conditional claim: a plain update by id would still
         fire if Support withdrew this same claim, or another verifier
         actioned it, in the moment between the read above and this write —
         the same race verifyPaymentSubmission already guards against on the
         other side of this same decision. */
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submission.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${submission.submissionNumber} was decided a moment ago. Reload before sending it back.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.rejected",
          entity: "PaymentSubmission",
          entityId: submission.id,
          summary: withNote(
            `${submission.submissionNumber} sent back on ${submission.invoice.invoiceNumber}`,
            reason
          ),
          metadata: { ip, department: user.role },
        },
        tx
      );
    });

    revalidatePath("/app/collections");
    revalidatePath("/app/finance/payments");
    return { ok: true };
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Finance agrees, and the money becomes real.
 *
 * Deliberately does NOT write a Payment itself. It builds the form Finance
 * would have filled in at the counter and hands it to recordPayment — the same
 * action, the same transaction, the same receipt numbering, the same ledger
 * posting, the same rule about when a pickup note is minted. Every one of those
 * behaviours is load-bearing and none of them is reimplemented here, which is
 * the whole reason this feature could be added without touching the workflow
 * the owner asked us to leave alone.
 *
 * Finance names the account at this moment rather than Support at submission,
 * because Support does not know and must not guess where money landed.
 */
export async function verifyPaymentSubmission(
  _prev: ActionResult<{ receiptNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ receiptNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return fail("Missing submission.");
  const accountId = String(formData.get("accountId") ?? "");
  const ip = await callerIp();

  const submission = await prisma.paymentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      submissionNumber: true,
      status: true,
      invoiceId: true,
      amount: true,
      currency: true,
      method: true,
      /* What Support said the customer's proof named. Finance's own choice
         still wins — this is only the answer they start from. */
      accountId: true,
      /* The split Support wrote down, which is the whole reason the claimed
         figure is larger than the bill. It travels into recordPayment below
         and becomes the Payment's own transport. */
      transportAmount: true,
      transportSourceId: true,
      /* Support's answer to the shortfall. Finance's own tick on this screen
         overrides it — see the handover below. */
      clearShortfall: true,
      reference: true,
      note: true,
      proofs: { select: { id: true } },
      invoice: { select: { invoiceNumber: true } },
      customerId: true,
      /* Which bills the claim covers. Empty on a single-bill claim, and then
         invoiceId above is the answer — the shape the backfill gave every
         existing PENDING row, so both read the same here. */
      allocations: { select: { invoiceId: true, amount: true } },
    },
  });
  if (!submission) return fail("That submission no longer exists.");
  if (submission.status !== "PENDING") {
    return fail(`${submission.submissionNumber} has already been dealt with.`);
  }

  /*
    TWO CLAIMS ON ONE BILL IS A DEAD END UNLESS SOMEBODY IS TOLD.

    Verifying marks this claim VERIFIED and then records the payment — and
    recordPayment refuses while ANY claim is still pending on the bill, which
    after that mark is the other one. So both claims sat unverifiable and the
    counter could not take the money either, with nothing on any screen saying
    why. It happens when two desks raise the same customer's payment in the
    same moment; rare, and permanent when it does.

    Said out loud here, with the one thing that clears it: reject the duplicate.
  */
  const covered = [
    submission.invoiceId,
    ...submission.allocations.map((a) => a.invoiceId),
  ].filter((id): id is string => Boolean(id));
  const alsoPending = await prisma.paymentSubmission.findFirst({
    where: {
      id: { not: submission.id },
      status: "PENDING",
      OR: [
        { invoiceId: { in: covered } },
        { allocations: { some: { invoiceId: { in: covered } } } },
      ],
    },
    select: {
      submissionNumber: true,
      amount: true,
      currency: true,
      submittedBy: { select: { name: true } },
    },
  });
  if (alsoPending) {
    return fail(
      `${alsoPending.submissionNumber} is also waiting on this bill (${alsoPending.currency} ${toNumber(
        alsoPending.amount
      ).toLocaleString()}, from ${alsoPending.submittedBy?.name ?? "Customer Support"}). ` +
        `Two claims for the same money cannot both be verified — send one back first, then verify the one that is right.`
    );
  }

  /*
    Hand it to the counter action exactly as if Finance had typed it.

    A claim covering more than one bill goes to the COMBINED counter action,
    which is the same code Finance uses by hand: one payment, one receipt, one
    ledger line, one allocation per bill. Verifying it as several separate
    payments would recreate the four-receipts problem the combined screen
    exists to end, on the far side of the verification step.
  */
  /*
    ANY split, not only a split across several bills.

    This tested for MORE than one allocation, so a claim carrying exactly one —
    legal, and what the combined form produces when the customer overpaid and
    the balance is to sit as credit — took the single-bill branch and put the
    WHOLE tendered amount against that bill, ignoring the share Support had
    written down. The combined action honours both the amount and the split, so
    anything carrying a split goes to it.
  */
  const combined = submission.allocations.length >= 1;
  const handover = new FormData();
  handover.set("amount", toNumber(submission.amount).toString());
  handover.set("currency", submission.currency);
  /*
    THE ACCOUNT FINANCE NAMES DECIDES HOW IT WAS PAID.

    Support claims what a customer told them and does not know where the money
    landed; the claim carries mobile money because that is what it is here nine
    times in ten. Finance then names the account it actually reached, and that
    account is the answer — the tin is cash, a till is mobile money, a bank is
    a transfer. Reading the method off the named account rather than off what
    was claimed is how a
    payment ends up saying it arrived by a route its own account cannot
    receive, which is a line nobody can reconcile against a statement.
  */
  /* No method travels on this handover any more: recordPayment reads it off
     the accountId below, which is the same account this block used to look up
     purely to restate as a method. */
  /*
    THE SPLIT SUPPORT WROTE DOWN TRAVELS WITH THE MONEY.

    Without this the whole claimed figure would be put against the bill — which
    is the overpayment recordPayment exists to refuse, so a perfectly good claim
    would simply fail to verify and nobody would be able to say why. With it,
    the cargo half settles the bill and the transport half posts its own leg out
    of the cash or Lipa account, exactly as it does when Finance takes the money
    across the counter.

    Finance can name a different transport account on the verify form; theirs
    wins, because they are the desk that actually pays the driver.
  */
  const transport = toNumber(submission.transportAmount);
  if (transport > 0) {
    handover.set("transport", transport.toString());
    /*
      A CLAIM THAT WAS ALREADY QUESTIONED IS NOT QUESTIONED AGAIN HERE.

      recordPayment refuses a fare bigger than the cargo half unless somebody
      has looked at it and said it is right. Support answered that question
      when they raised the claim — the claim would not exist otherwise — and
      Finance is looking at both halves on this screen before agreeing. Without
      this the claim would be accepted, marked VERIFIED, and then bounce off
      the counter action with nothing left to show for it.
    */
    handover.set("transportConfirmed", "1");
    const namedSource = String(formData.get("transportSourceId") ?? "");
    const source = namedSource || submission.transportSourceId;
    if (source) handover.set("transportSourceId", source);
  }
  /*
    THE LAST FEW SHILLINGS, DECIDED BY THE DESK THAT SIGNS FOR IT.

    Support raises the claim knowing what the customer said; Finance is the
    desk that may write a difference off, so Finance is the desk whose answer
    travels. The verify form states one either way — "1" or "0" — so an
    unticked box on that screen means NO rather than falling back to Support's
    yes. A claim verified from anywhere that says nothing keeps what Support
    was told, which is the only other honest reading.

    recordPayment recomputes the gap from the database and refuses the tick to
    a desk without ledger.adjust, so this can only ever ask.
  */
  const shortfallSaid = formData.get("clearShortfall");
  const clearRest =
    shortfallSaid === null
      ? submission.clearShortfall
      : String(shortfallSaid) === "1";
  if (clearRest) handover.set("clearShortfall", "1");

  if (submission.reference) handover.set("reference", submission.reference);
  if (submission.note) handover.set("note", submission.note);
  if (accountId) handover.set("accountId", accountId);

  if (combined) {
    if (!submission.customerId) {
      return fail(
        `${submission.submissionNumber} covers several bills but names no customer. It cannot be verified — reject it and ask for it to be raised again.`
      );
    }
    handover.set("customerId", submission.customerId);
    handover.set(
      "allocations",
      JSON.stringify(
        submission.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: toNumber(allocation.amount),
        }))
      )
    );
  } else {
    handover.set("invoiceId", submission.invoiceId);
    // Carry Finance's own rate override through, when they set one. Only for a
    // single bill: a combined payment converts at each bill's own frozen rate,
    // and one override across several would restate them all at a figure that
    // matches none of the quotes the customer was given.
    const rate = String(formData.get("exchangeRate") ?? "");
    if (rate) handover.set("exchangeRate", rate);
  }

  /*
    The row is claimed before a shilling moves.

    The read above is not a gate. Two clerks with the verify queue open — or one
    clerk double-clicking "Confirm and record" on a slow connection — both saw
    PENDING, both went on, and the customer's one USD 150 transfer became two
    Payments, two receipt numbers and two CUSTOMER_PAYMENT lines against the
    named account: cash the business does not have, in a balance that can never
    be reconciled against the bank statement. recordPayment cannot catch it
    either, because its own guard only refuses money beyond what is outstanding,
    and on a part-paid bill the second 150 still fits.

    So the status goes in the WHERE clause and the money happens only for the
    caller that actually moved the row — the same claim a credit decision makes
    (lib/actions/credit.ts:222) and the same one the warehouse makes before
    writing a status history line (lib/actions/batches.ts:992). The loser is told
    it has already been dealt with, and recordPayment is called exactly once.
  */
  const claimed = await prisma.paymentSubmission.updateMany({
    where: { id: submission.id, status: "PENDING" },
    data: { status: "VERIFIED", reviewedById: user.id, reviewedAt: new Date() },
  });
  if (claimed.count === 0) {
    return fail(`${submission.submissionNumber} has already been dealt with.`);
  }

  const { recordPayment, recordCustomerPayment } = await import(
    "@/lib/actions/finance"
  );
  const recorded = combined
    ? await recordCustomerPayment(undefined, handover)
    : await recordPayment(undefined, handover);
  if (!recorded.ok) {
    /*
      Refused, so the claim goes back.

      Every refusal recordPayment can answer with is raised before or inside its
      own transaction — no permission, a figure that does not parse, a proof that
      would not store, a bill somebody settled at the counter first — so nothing
      was written and the claim must not outlive the attempt. Most of them are
      fixable, and the submission returns to the queue exactly as Support left it
      rather than being burnt: without this, forgetting to name the receiving
      account would cost the desk the claim and the customer's evidence with it.
      Guarded on paymentId being null so it can never un-verify a claim that has
      already been tied to money.
    */
    await prisma.paymentSubmission.updateMany({
      where: { id: submission.id, status: "VERIFIED", paymentId: null },
      data: { status: "PENDING", reviewedById: null, reviewedAt: null },
    });
    return recorded as ActionResult<{ receiptNumber: string }>;
  }

  /*
    The payment now exists. Tie the submission to it, move the evidence across so
    the customer's screenshot hangs off the money rather than off a claim, and
    close the loop for the desk that submitted it.

    Found by the receipt this call just issued, which belongs to exactly one
    payment. It used to be "the newest payment against this invoice", which is
    not necessarily ours: a part-paid bill being settled at the counter in the
    same minute would hand the customer's screenshot to somebody else's money,
    and paymentId is unique on a submission, so it would eventually collide.
  */
  const receipt = recorded.data?.receiptNumber
    ? await prisma.receipt.findUnique({
        where: { receiptNumber: recorded.data.receiptNumber },
        select: { paymentId: true },
      })
    : null;
  const paymentId = receipt?.paymentId ?? null;

  await prisma.$transaction(async (tx) => {
    // Status and reviewer were written by the claim above; this is what the
    // claim could not know yet.
    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: { paymentId },
    });
    if (paymentId && submission.proofs.length > 0) {
      await tx.paymentProof.updateMany({
        where: { submissionId: submission.id },
        data: { paymentId },
      });
    }
    await recordAudit(
      {
        actor: user,
        action: "payment.verified",
        entity: "PaymentSubmission",
        entityId: submission.id,
        summary: `${submission.submissionNumber} verified against ${submission.invoice.invoiceNumber} — receipt ${recorded.data?.receiptNumber ?? "issued"}`,
        metadata: { ip, department: user.role, receipt: recorded.data?.receiptNumber },
      },
      tx
    );
  });

  revalidatePath("/app/collections");
  revalidatePath("/app/finance/payments");
  revalidatePath("/app/support");
  return { ok: true, data: { receiptNumber: recorded.data?.receiptNumber ?? "" } };
}

/**
 * ONE TRANSFER, SEVERAL BILLS, CLAIMED BY SUPPORT.
 *
 * The desk that hears from the customer is Support, and a customer with four
 * consignments sends one transfer for all four. Until now a claim could name
 * one bill, so Support raised four — and Finance then verified four times,
 * producing four payments, four receipts and four account movements for a
 * deposit the bank statement shows once. That is exactly what the combined
 * payment screen was built to stop, and Support was the desk locked out of it.
 *
 * THE BUSINESS RULE DOES NOT CHANGE. Support still only ever says a customer
 * SAYS they paid; nothing reaches an account until Finance verifies it, and
 * verification hands the whole thing to the same counter action Finance uses
 * by hand. Billing together changes who can claim it in one go, not who is
 * allowed to say money arrived.
 *
 * Deliberately its own action rather than a mode inside the single-bill one.
 * That one is called from a cargo page and from the follow-up queue, and money
 * code that grows a second shape is money code nobody can reason about.
 */
export async function submitCombinedPayment(
  _prev: ActionResult<{ submissionNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ submissionNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.submit");
  } catch (error) {
    return fail(toActionError(error));
  }

  /* This request's own identity, not part of what a claim IS. See
     lib/idempotency.ts — two tabs submitting the same claim both pass the
     duplicate check, which reads before it writes; the unique index does not. */
  const idempotencyKey = idempotencyKeyFrom(formData);

  const parsed = customerPaymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const ip = await callerIp();

  if (input.allocations.length === 0) {
    /* A deposit is money that has ARRIVED against no bill. Support cannot say
       money arrived — that is the whole point of the verification step — so
       there is nothing here for them to claim. */
    return fail(
      "Tick the cargo this payment covers. A payment held as credit is recorded by Finance, not claimed here."
    );
  }

  /*
    THE TRANSPORT IS NOT AVAILABLE TO SETTLE BILLS.

    A customer with four consignments sends one transfer for all four AND the
    delivery. Only the cargo half can be put against the bills — the rest is
    somebody's fare, and allocating it would settle four invoices with money
    that is about to leave again.

    So the ceiling on the split is what was sent MINUS the transport, and the
    figure quoted back names both, because "you have allocated more than the
    payment" is a baffling thing to be told about a payment that is visibly
    large enough.
  */
  const transport = input.transport ?? 0;
  if (transport > input.amount + 0.005) {
    return fail(
      `The transport (${input.currency} ${transport.toLocaleString()}) is more than the customer sent ` +
        `(${input.currency} ${input.amount.toLocaleString()}).`
    );
  }
  const forBills = Math.round((input.amount - transport) * 100) / 100;
  /* The same ceiling as the single-bill claim, for the same reason — see
     there. Measured against the cargo half, because against the total it is
     an identity now that the screens add the fare on top. */
  if (transport > forBills + 0.005 && !input.transportConfirmed) {
    return fail(
      `The transport (${input.currency} ${transport.toLocaleString()}) is more than the ` +
        `${input.currency} ${forBills.toLocaleString()} going to the bills. ` +
        `Check the figure — if it is right, tick to confirm it.`
    );
  }
  const allocated = input.allocations.reduce((sum, a) => sum + a.amount, 0);
  if (allocated > forBills + 0.005) {
    return fail(
      `You have put ${input.currency} ${allocated.toLocaleString()} against bills out of a ` +
        `${input.currency} ${input.amount.toLocaleString()} payment` +
        (transport > 0
          ? `, of which ${input.currency} ${transport.toLocaleString()} is transport — leaving ` +
            `${input.currency} ${forBills.toLocaleString()} for the bills`
          : "") +
        `. Money cannot be claimed twice over.`
    );
  }

  /* Stored before the transaction, exactly as the single-bill claim does it: a
     file crossing the network must not hold a row lock on an invoice. */
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
          customerId: true,
          shipment: { select: { trackingNumber: true, status: true } },
          submissions: {
            where: { status: "PENDING" },
            select: { submissionNumber: true },
          },
          /* And a merged claim that covers this bill among others — the same
             blindness recordCustomerPayment had. */
          submissionAllocations: {
            where: { submission: { status: "PENDING" } },
            select: { submission: { select: { submissionNumber: true } } },
          },
        },
      });
      if (invoices.length !== input.allocations.length) {
        throw new Error("One of those bills no longer exists. Reload and try again.");
      }

      for (const invoice of invoices) {
        if (invoice.customerId !== customer.id) {
          throw new Error(
            `${invoice.invoiceNumber} does not belong to ${customer.name}. One claim covers one customer's bills.`
          );
        }
        // A draft is the system's price, not a bill. Collecting against one asks
        // a customer for a figure this business has not agreed to yet.
        if (invoice.status === "DRAFT") {
          throw new Error(
            `${invoice.invoiceNumber} is still a draft. Finance has to confirm the price before anything can be collected against it.`
          );
        }
        if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
          throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
        }
        if (invoice.status === "PAID") {
          throw new Error(`${invoice.invoiceNumber} is already settled.`);
        }
        /* Every bill in the merge, so one un-landed consignment cannot ride
           in on a set that is otherwise good. */
        if (!isCollectable(invoice.shipment.status)) {
          throw new Error(notPayableMessage(invoice.shipment.trackingNumber));
        }
        /* One claim at a time per bill. Two pending claims against one invoice
           is two people ringing the same customer and Finance verifying the
           same money twice — the refusal the single-bill claim already makes,
           and it must not be escapable by claiming several at once. */
        const claimed =
          invoice.submissions[0]?.submissionNumber ??
          invoice.submissionAllocations[0]?.submission.submissionNumber;
        if (claimed) {
          throw new Error(
            `${claimed} is already with Finance for ${invoice.invoiceNumber}. Wait for it to be checked.`
          );
        }
      }

      /* Anchored to one of the bills, because that column is what every
         existing screen reads. Which one is arbitrary — the allocations are
         the truth. */
      const anchor = invoices.find(
        (invoice) => invoice.id === input.allocations[0].invoiceId
      )!;

      const account = await claimedAccount(tx, input.accountId, input.currency);
      const transportSource = await claimedTransportSource(
        tx,
        input.transportSourceId,
        transport,
        input.currency
      );

      const submission = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          idempotencyKey,
          invoiceId: anchor.id,
          customerId: customer.id,
          amount: new Prisma.Decimal(input.amount),
          /* The whole transfer stays in `amount`; this names the part of it
             that was the delivery, and the allocations above only ever total
             the rest. */
          transportAmount: new Prisma.Decimal(transport),
          transportSourceId: transportSource?.id ?? null,
          currency: input.currency,
          method: methodForKind(account.kind),
          accountId: account.id,
          reference: input.reference || null,
          note: input.note || null,
          submittedById: user.id,
          allocations: {
            create: input.allocations.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: new Prisma.Decimal(allocation.amount),
            })),
          },
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
        select: { id: true, submissionNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.submitted",
          entity: "PaymentSubmission",
          entityId: submission.id,
          summary:
            `${submission.submissionNumber} — ${input.currency} ${input.amount.toLocaleString()} claimed ` +
            `for ${customer.name} across ${input.allocations.length} bill(s)` +
            (transport > 0
              ? ` (includes ${input.currency} ${transport.toLocaleString()} transport)`
              : ""),
          metadata: {
            ip,
            department: user.role,
            customer: customer.name,
            proofs: proofs.length,
            reference: input.reference || null,
            transport: transport || null,
            transportFrom: transportSource?.name ?? null,
            bills: invoices.map((invoice) => ({
              invoice: invoice.invoiceNumber,
              tracking: invoice.shipment.trackingNumber,
            })),
          },
        },
        tx
      );

      return { submissionNumber: submission.submissionNumber };
    });

    revalidatePath("/app/collections");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance/payments/new");
    return ok(result);
  } catch (error) {
    /* The unique index refusing a repeat, not a fault. See lib/idempotency.ts. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been sent to Finance. Reload the page — sending it again would claim the same money twice."
      );
    }
    return fail(toActionError(error));
  }
}
