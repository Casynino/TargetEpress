"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type ExceptionStatus,
  type PaymentMethod,
  type ResolutionType,
  type ShipmentStatus,
} from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import {
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_TERMINAL_STATUSES,
  EXCEPTION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  RESOLUTION_NOTE_REQUIRED,
  RESOLUTION_TYPE_LABELS,
} from "@/lib/constants";
import { desksHolding } from "@/lib/exception-audience";
import { formatDate, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextPickupNoteNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import { REPORTED_CARGO_ABSENT, restoredStatus } from "@/lib/investigations";
import { notify } from "@/lib/notify";
import { prisma, type TxClient } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Working an investigation: finding the cargo again, and paying for it when it
 * is never found.
 *
 * Two things in this file are load-bearing and neither is obvious:
 *
 *  1. Nothing here ever renders money. The compensation amount is written as a
 *     Decimal and read back only through lib/investigations.ts, which refuses
 *     the figure to anybody without `finance.view`. The audit trail this file
 *     writes onto the case — ExceptionEvent, which the Dar floor can read —
 *     deliberately records *that* compensation was recorded and never *how
 *     much*. A timeline line is not a place to leak a payout to the warehouse.
 *
 *  2. Cargo Found has to decide what operational status the cargo returns to,
 *     and that decision is derived from ShipmentStatusHistory rather than
 *     guessed — see `restoredStatus` in lib/investigations.ts.
 *
 * OVERLAP TO RESOLVE: lib/actions/investigation-queue.ts `advanceInvestigation`
 * can also drive a case to CARGO_FOUND, through
 * `returnFoundCargoToInventory`. The two differ on the owner's rule "if payment
 * had already been made the status becomes Ready for Pickup": that one holds
 * READY_FOR_PICKUP back in every case, this one restores it when a live pickup
 * note says the freight was already settled. Both write CARGO_FOUND, so one of
 * them should stop: either drop CARGO_FOUND from LIFECYCLE_STEPS and point the
 * button at `markCargoFound`, or move the pickup-note logic below into
 * `returnFoundCargoToInventory` and delete this action. Leaving both is how a
 * warehouse gets two "Cargo found" buttons that do different things.
 */

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

const TERMINAL = EXCEPTION_TERMINAL_STATUSES as readonly ExceptionStatus[];

/**
 * One line on the case timeline, always inside the caller's transaction so a
 * thing that happened and the record of it cannot disagree.
 *
 * `action` is deliberately drawn from the small set the schema documents —
 * "opened", "status.changed", "note.added", "photo.added", "cargo.found",
 * "assigned", "compensation.recorded", "closed" — because the UI renders it
 * through a label map. Inventing a new string here would render as a blank.
 */
async function logEvent(
  tx: TxClient,
  input: {
    exceptionId: string;
    action: string;
    note?: string | null;
    actorId: string | null;
  }
) {
  await tx.exceptionEvent.create({
    data: {
      exceptionId: input.exceptionId,
      action: input.action,
      note: input.note ?? null,
      actorId: input.actorId,
    },
  });
}

/**
 * Desks are addressed by permission, never by role — `desksHolding` in
 * lib/exception-audience.ts. "Tell Customer Support" is really "tell whoever
 * answers customers", and writing it as a role list is how a fifth department
 * silently stops being told anything.
 *
 * The permissions used here read as the desks the owner named:
 *   ticket.manage        → Customer Support
 *   user.manage          → the CEO
 *   exception.compensate → Finance's payout desk
 *   pickupNote.issue     → whoever can actually clear cargo for collection
 */

// ---------------------------------------------------------------------------
// Cargo Found
// ---------------------------------------------------------------------------

const cargoFoundSchema = z.object({
  exceptionId: z.string().min(1),
  note: z
    .string()
    .trim()
    .min(3, "Say where the cargo was found — the next person will ask."),
});

/**
 * The box turned up.
 *
 * Returns the cargo to Available Cargo, takes the case out of the queue,
 * restores the operational status the case interrupted, and tells Customer
 * Support so somebody can ring the customer. If the freight was already paid
 * for, the cargo goes straight back to Ready for Pickup.
 *
 * Held by `exception.investigate` — the Dar floor, Support and the CEO. It is
 * not a close: the case ends at CARGO_FOUND, which is terminal for the
 * investigation but is not the CEO's sign-off on a payout.
 *
 * Every message that comes back out of here lands in a form the operator is
 * looking at, so it is rendered in the language they read. The locale comes
 * from `viewerLocale`, not from a parameter: a form action is invoked by React
 * with (previous state, FormData) and nothing else, so there is no argument to
 * pass one through. What is deliberately NOT translated is anything written to
 * the database — timeline notes, audit summaries, notification bodies. Those
 * rows are read by both floors, and translating them at write time would store
 * the writer's language and show it to everybody else.
 */
export async function markCargoFound(
  _prev:
    | ActionResult<{ trackingNumber: string; status: ShipmentStatus }>
    | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string; status: ShipmentStatus }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("exception.investigate");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = cargoFoundSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id: input.exceptionId },
        select: {
          id: true,
          type: true,
          status: true,
          raisedAt: true,
          raisedById: true,
          assignedToId: true,
          shipmentId: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              arrivedAt: true,
              readyForPickup: true,
              deletedAt: true,
              customerId: true,
              currency: true,
              invoice: {
                select: {
                  id: true,
                  status: true,
                  total: true,
                  amountPaid: true,
                  currency: true,
                },
              },
              pickupNote: { select: { id: true, status: true, noteNumber: true } },
              packageList: { select: { id: true, receivedAt: true } },
            },
          },
        },
      });
      if (!exception) throw new Error(t(locale, "Investigation not found."));

      const shipment = exception.shipment;

      // Re-runnable by accident, not by design: a double submit finds the case
      // already at CARGO_FOUND and stops, rather than writing a second history
      // line and a second timeline entry for one physical event.
      if (TERMINAL.includes(exception.status)) {
        throw new Error(
          t(locale, "This case is already finished. Nothing further to record on it.")
        );
      }
      if (shipment.deletedAt) {
        throw new Error(t(locale, "That cargo record has been deleted."));
      }
      if (shipment.status === "DELIVERED") {
        throw new Error(
          `${shipment.trackingNumber} ${t(locale, "has already been handed over. Finding cargo against a delivered consignment needs the CEO.")}`
        );
      }
      if (shipment.status === "CANCELLED") {
        throw new Error(
          `${shipment.trackingNumber} ${t(locale, "was cancelled. Restore the cargo record before closing this case.")}`
        );
      }

      // --- what status does it return to? --------------------------------
      const recorded = await tx.shipmentStatusHistory.findFirst({
        where: {
          shipmentId: shipment.id,
          createdAt: { lte: exception.raisedAt },
        },
        orderBy: { createdAt: "desc" },
        select: { toStatus: true },
      });
      const restored = restoredStatus(recorded?.toStatus ?? null, shipment.status);

      // --- is it clear to go back on the pickup counter? ------------------
      // Any other case still running keeps it off, whatever this one says.
      // "Customers never see Ready for Pickup for cargo that is unavailable"
      // is one rule, and it does not care which case is the unavailable one.
      const otherOpen = await tx.shipmentException.count({
        where: {
          shipmentId: shipment.id,
          id: { not: exception.id },
          status: { in: [...EXCEPTION_OPEN_STATUSES] },
        },
      });

      const invoice = shipment.invoice;
      // Decimal comparison, never a float one. A zero-total invoice is not
      // "settled" — it is unbilled, and unbilled cargo is not cleared to leave.
      const settled =
        invoice !== null &&
        invoice.status !== "VOID" &&
        (invoice.status === "PAID" ||
          (invoice.total.gt(0) && invoice.amountPaid.gte(invoice.total)));

      const activeNote =
        shipment.pickupNote && shipment.pickupNote.status === "ACTIVE"
          ? shipment.pickupNote
          : null;

      let target: ShipmentStatus = "RECEIVED_AT_DAR";
      let issuedNote: string | null = null;
      let financeMustIssueNote = false;

      if (otherOpen === 0 && (restored === "READY_FOR_PICKUP" || settled)) {
        if (activeNote) {
          // The counter case: paid, note live, box mislaid, box found.
          target = "READY_FOR_PICKUP";
        } else if (
          settled &&
          invoice &&
          // PickupNote.shipmentId is unique, so a cancelled or used note cannot
          // be replaced — only cargo that has never had one can get one here.
          !shipment.pickupNote &&
          can(user.role, "pickupNote.issue")
        ) {
          // Finance or the CEO found it themselves, and the freight is paid.
          // The gate is not weakened: a note is still only minted by somebody
          // holding pickupNote.issue, against an invoice that is already fully
          // settled — the same two conditions issuePickupNote enforces.
          const note = await tx.pickupNote.create({
            data: {
              noteNumber: await nextPickupNoteNumber(tx),
              shipmentId: shipment.id,
              customerId: shipment.customerId,
              amountPaid: invoice.amountPaid,
              currency: shipment.currency,
              issuedById: user.id,
            },
          });
          issuedNote = note.noteNumber;
          target = "READY_FOR_PICKUP";
        } else if (settled) {
          // Paid for, but there is no note to release it against — either the
          // warehouse found it (and the warehouse does not issue notes), or an
          // old note was cancelled or used. The cargo sits in inventory and
          // Finance is told. Saying READY_FOR_PICKUP here would put a customer
          // on the road for cargo the counter cannot legally hand over.
          financeMustIssueNote = true;
        }
      }

      const now = new Date();

      // --- the cargo -----------------------------------------------------
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: target,
          // The box is in the building. If the case was raised at check-in the
          // shipment never got an arrival stamp, and Available Cargo sorts
          // on it — cargo with no arrival date sorts as if it landed today.
          arrivedAt: shipment.arrivedAt ?? now,
          readyForPickup:
            target === "READY_FOR_PICKUP"
              ? (shipment.readyForPickup ?? now)
              : null,
        },
      });

      // Boxes the case had left unaccounted for. Only for the case types that
      // actually reported cargo absent — see REPORTED_CARGO_ABSENT.
      let ticked = 0;
      if (REPORTED_CARGO_ABSENT[exception.type]) {
        const outstanding = shipment.packageList.filter((p) => !p.receivedAt);
        if (outstanding.length > 0) {
          const done = await tx.package.updateMany({
            where: { id: { in: outstanding.map((p) => p.id) }, receivedAt: null },
            data: { receivedAt: now, receivedById: user.id },
          });
          ticked = done.count;
        }
      }

      if (target !== shipment.status) {
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: target,
            location: "Dar es Salaam warehouse",
            note: `Cargo found. ${input.note}`,
            actorId: user.id,
          },
        });
      }

      // --- the case ------------------------------------------------------
      await tx.shipmentException.update({
        where: { id: exception.id },
        data: {
          status: "CARGO_FOUND",
          resolvedById: user.id,
          resolvedAt: now,
          resolutionNote: input.note,
        },
      });

      await logEvent(tx, {
        exceptionId: exception.id,
        action: "cargo.found",
        note:
          `${input.note} — returned to warehouse inventory` +
          (target === "READY_FOR_PICKUP" ? " and cleared for pickup." : ".") +
          (ticked > 0 ? ` ${ticked} package(s) checked in.` : "") +
          (otherOpen > 0
            ? ` Held off the counter: ${otherOpen} other case(s) still open on this cargo.`
            : "") +
          (financeMustIssueNote
            ? " Freight is paid — Finance still has to issue the pickup note."
            : ""),
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.cargoFound",
          entity: "ShipmentException",
          entityId: exception.id,
          summary: `Cargo found for ${shipment.trackingNumber} (${EXCEPTION_TYPE_LABELS[exception.type]})`,
          metadata: {
            shipment: shipment.trackingNumber,
            restoredTo: target,
            recordedPreviousStatus: recorded?.toStatus ?? null,
            packagesCheckedIn: ticked,
            pickupNoteIssued: issuedNote,
            financeMustIssueNote,
            otherOpenCases: otherOpen,
            note: input.note,
          },
        },
        tx
      );

      // --- who needs to know ---------------------------------------------
      // Customer Support first: somebody has to ring the person who was told
      // their cargo was missing. The CEO sees every case, and the two people
      // closest to this one — whoever raised it and whoever is carrying it —
      // are added by name.
      const audience = new Set<string>(
        await desksHolding(["ticket.manage", "user.manage"], tx)
      );
      if (exception.raisedById) audience.add(exception.raisedById);
      if (exception.assignedToId) audience.add(exception.assignedToId);
      audience.delete(user.id);

      await notify(
        {
          userIds: [...audience],
          kind: "exception.cargoFound",
          title: `Cargo found — ${shipment.trackingNumber}`,
          body:
            target === "READY_FOR_PICKUP"
              ? `Back in the Dar warehouse and cleared for pickup. ${input.note}`
              : `Back in the Dar warehouse. ${input.note}`,
          href: `/app/cargo/${shipment.id}`,
        },
        tx
      );

      if (financeMustIssueNote) {
        await notify(
          {
            // The desk that can actually fix it: whoever issues pickup notes.
            userIds: (await desksHolding(["pickupNote.issue"], tx)).filter(
              (id) => id !== user.id
            ),
            kind: "exception.cargoFound.needsNote",
            title: `${shipment.trackingNumber} found — pickup note needed`,
            body:
              "The freight on this cargo is settled and the cargo is back in the warehouse, but there is no active pickup note. It cannot be released until one is issued.",
            href: `/app/cargo/${shipment.id}`,
          },
          tx
        );
      }

      return {
        trackingNumber: shipment.trackingNumber,
        status: target,
        shipmentId: shipment.id,
      };
    });

    revalidatePath("/app/exceptions");
    revalidatePath(`/app/exceptions/${input.exceptionId}`);
    revalidatePath(`/app/cargo/${result.shipmentId}`);
    revalidatePath("/app/inventory");
    revalidatePath("/app/pickup-queue");
    revalidatePath("/app/dashboard");
    return ok({ trackingNumber: result.trackingNumber, status: result.status });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

const approvalSchema = z.object({
  exceptionId: z.string().min(1),
  note: z
    .string()
    .trim()
    .min(3, "Record what is being approved and why."),
});

/**
 * The CEO says yes to paying for it.
 *
 * `exception.approve` is held by nobody but ADMIN — not by the Dar floor, which
 * the owner bars from approving compensation, and not by Finance, so the desk
 * that pays a figure is never the desk that decided it.
 *
 * This records the decision, not the money. Finance then records what actually
 * went out, in `recordCompensation`, which refuses to run until this has.
 */
export async function approveCompensation(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("exception.approve");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = approvalSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const shipmentId = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id: input.exceptionId },
        select: {
          id: true,
          status: true,
          type: true,
          raisedById: true,
          assignedToId: true,
          shipment: { select: { id: true, trackingNumber: true } },
        },
      });
      if (!exception) throw new Error(t(locale, "Investigation not found."));
      if (TERMINAL.includes(exception.status)) {
        throw new Error(
          t(locale, "This case is finished. Reopen it before approving a payout.")
        );
      }
      if (exception.status === "COMPENSATION_APPROVED") {
        throw new Error(t(locale, "Compensation is already approved on this case."));
      }

      await tx.shipmentException.update({
        where: { id: exception.id },
        data: { status: "COMPENSATION_APPROVED" },
      });

      await logEvent(tx, {
        exceptionId: exception.id,
        action: "status.changed",
        // No figure here on purpose: the timeline is readable by the warehouse,
        // and the warehouse never sees money. The amount lives on the
        // Compensation row, behind finance.view.
        note: `Compensation approved. ${input.note}`,
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.approveCompensation",
          entity: "ShipmentException",
          entityId: exception.id,
          summary: `Compensation approved on ${exception.shipment.trackingNumber}`,
          metadata: { note: input.note, type: exception.type },
        },
        tx
      );

      const audience = new Set<string>(
        await desksHolding(["exception.compensate", "ticket.manage"], tx)
      );
      if (exception.raisedById) audience.add(exception.raisedById);
      if (exception.assignedToId) audience.add(exception.assignedToId);
      audience.delete(user.id);

      await notify(
        {
          userIds: [...audience],
          kind: "exception.compensationApproved",
          title: `Compensation approved — ${exception.shipment.trackingNumber}`,
          body: "Finance can now record the payout against this investigation.",
          href: `/app/cargo/${exception.shipment.id}`,
        },
        tx
      );

      return exception.shipment.id;
    });

    revalidatePath("/app/exceptions");
    revalidatePath(`/app/exceptions/${input.exceptionId}`);
    revalidatePath(`/app/cargo/${shipmentId}`);
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const PAYMENT_METHODS = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CHEQUE",
] as const satisfies readonly PaymentMethod[];

/**
 * Money is read off the form as a string and handed to Decimal untouched.
 *
 * Not `Number(value)` and not zod's `.coerce.number()`: a shilling figure that
 * has been through a float is a figure that can come back a cent short, and
 * this one is a payout the company owes a customer.
 */
const compensationSchema = z
  .object({
    exceptionId: z.string().min(1),
    amount: z
      .string()
      .trim()
      .regex(
        /^\d{1,10}(\.\d{1,2})?$/,
        "Amount must be a plain number, e.g. 250000 or 250000.50."
      )
      .refine((v) => new Prisma.Decimal(v).gt(0), "Amount must be more than zero."),
    currency: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v.toUpperCase() : "TZS"))
      .refine(
        (v): v is "TZS" | "USD" => v === "TZS" || v === "USD",
        "Currency must be TZS or USD."
      ),
    paidAt: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? new Date(v) : null))
      .refine(
        (v) => v === null || !Number.isNaN(v.getTime()),
        "That payment date is not a date."
      )
      .refine(
        (v) => v === null || v.getTime() <= Date.now() + 86_400_000,
        "A payout cannot be dated in the future."
      ),
    method: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null))
      .refine(
        (v): v is PaymentMethod | null =>
          v === null || (PAYMENT_METHODS as readonly string[]).includes(v),
        "Choose how the money went out."
      ),
    accountId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    note: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine((v) => v.paidAt === null || v.method !== null, {
    message: "A payment date needs a payment method — cash, mobile money, bank transfer or cheque.",
    path: ["method"],
  })
  .refine((v) => v.paidAt === null || v.accountId !== null, {
    message:
      "Money that has gone out must name the account it left. Pick one under \"Paid from\".",
    path: ["accountId"],
  })
  .refine((v) => v.accountId === null || v.paidAt !== null, {
    message:
      "Pick the payment date first — the account records where the money left on that day.",
    path: ["paidAt"],
  });

/**
 * Finance records what was paid out.
 *
 * One settlement per case (Compensation.exceptionId is unique) — a second
 * payout is a second case, which is what keeps the ledger readable. Re-running
 * this amends the record rather than adding another; the previous figures go
 * into the audit log, so an amendment is never a quiet overwrite.
 *
 * `paidAt` empty is the "Compensation Pending" the dashboard counts: an
 * approved amount that has not left the account yet.
 *
 * Held by `exception.compensate` — Finance and the CEO. The Dar floor cannot
 * reach this, by the owner's CANNOT list, and could not read the figure back
 * even if it did: see lib/investigations.ts.
 */
export async function recordCompensation(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("exception.compensate");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = compensationSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  // Valued before the transaction opens, exactly as expenses are: the ledger
  // line carries the money in USD so totals can cross accounts, and a missing
  // published rate should refuse loudly before anything is written.
  let usd: number | null = null;
  let rate: number | null = null;
  if (input.paidAt) {
    if (input.currency === "USD") {
      usd = Number(input.amount);
    } else {
      const published = await currentRateValue();
      if (!published) {
        return fail(
          t(
            locale,
            "No exchange rate is published, so a shilling cost cannot be valued in dollars. Publish one on Pricing & configuration first."
          )
        );
      }
      rate = published;
      usd = Math.round((Number(input.amount) / published) * 100) / 100;
    }
  }

  try {
    const shipmentId = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id: input.exceptionId },
        select: {
          id: true,
          status: true,
          type: true,
          raisedById: true,
          assignedToId: true,
          shipment: { select: { id: true, trackingNumber: true } },
          compensation: {
            select: {
              id: true,
              amount: true,
              currency: true,
              paidAt: true,
              method: true,
              accountId: true,
            },
          },
        },
      });
      if (!exception) throw new Error(t(locale, "Investigation not found."));

      const existing = exception.compensation;

      // Separation of duties, enforced rather than assumed: money is only
      // recorded against a case the CEO has approved. A case that already has a
      // settlement stays editable so a mistyped figure can be corrected without
      // a second approval round.
      if (!existing && exception.status !== "COMPENSATION_APPROVED") {
        throw new Error(
          t(
            locale,
            "Compensation has not been approved on this case yet. The CEO approves the payout before Finance records it."
          )
        );
      }

      const amount = new Prisma.Decimal(input.amount);

      /* Money that has gone out names the account it left, and the account
         must be able to say so: alive, and in the same currency as the
         figure. Same discipline as an expense. */
      let account: { id: string; name: string; currency: string } | null = null;
      if (input.paidAt && input.accountId) {
        const found = await tx.companyAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true, name: true, currency: true, active: true },
        });
        if (!found) throw new Error(t(locale, "That account no longer exists."));
        if (!found.active) {
          throw new Error(`${found.name} ${t(locale, "has been archived.")}`);
        }
        if (found.currency !== input.currency) {
          throw new Error(
            `${found.name} ${t(locale, "is a")} ${found.currency} ${t(locale, "account, so")} ${input.currency} ${Number(input.amount).toLocaleString()} ${t(locale, "cannot have left it.")}`
          );
        }
        account = { id: found.id, name: found.name, currency: found.currency };
      }

      const settlement = await tx.compensation.upsert({
        where: { exceptionId: exception.id },
        create: {
          exceptionId: exception.id,
          amount,
          currency: input.currency,
          paidAt: input.paidAt,
          method: input.method,
          note: input.note,
          accountId: input.accountId,
          recordedById: user.id,
        },
        update: {
          amount,
          currency: input.currency,
          paidAt: input.paidAt,
          method: input.method,
          note: input.note,
          accountId: input.accountId,
          recordedById: user.id,
        },
      });

      /*
        The ledger, kept true to the record just written.

        A payout is company money leaving a company account, and until this
        block existed it left invisibly: the settlement was stored, no account
        balance moved, and the general ledger had no line to show an auditor.
        Kind COMPENSATION had been in the enum since the ledger was designed —
        nothing wrote it.

        Amending follows the append-only rule: the old line is answered by a
        reversal pointing back at it, never edited. `reversesId` is unique, so
        two people amending at once cannot both reverse the same line — the
        second transaction unwinds whole.
      */
      const liveLines = await tx.ledgerEntry.findMany({
        where: {
          direction: "OUT",
          reversedBy: null,
          reversesId: null,
          sourceEntity: "Compensation",
          sourceId: settlement.id,
        },
        select: {
          id: true,
          entryNumber: true,
          accountId: true,
          currency: true,
          amount: true,
          amountUsd: true,
          exchangeRate: true,
          occurredAt: true,
        },
      });
      const paidNow = Boolean(input.paidAt && account);
      const keep = paidNow
        ? liveLines.find(
            (line) =>
              line.accountId === account!.id &&
              line.amount.equals(amount) &&
              line.occurredAt.getTime() === input.paidAt!.getTime()
          )
        : undefined;
      for (const line of liveLines) {
        if (line === keep) continue;
        await postLedgerEntry(tx, {
          accountId: line.accountId,
          currency: line.currency,
          direction: "IN",
          kind: "COMPENSATION",
          amount: toNumber(line.amount),
          amountUsd: toNumber(line.amountUsd),
          exchangeRate:
            line.exchangeRate === null ? null : toNumber(line.exchangeRate),
          occurredAt: new Date(),
          description: `${t(locale, "Cancels")} ${line.entryNumber} — ${exception.shipment.trackingNumber}`,
          sourceEntity: "Compensation",
          sourceId: settlement.id,
          recordedById: user.id,
          reversesId: line.id,
        });
      }
      if (paidNow && !keep) {
        await postLedgerEntry(tx, {
          accountId: account!.id,
          currency: account!.currency,
          direction: "OUT",
          kind: "COMPENSATION",
          amount: toNumber(amount),
          amountUsd: usd!,
          exchangeRate: rate,
          occurredAt: input.paidAt!,
          description: `${t(locale, "Compensation")} — ${exception.shipment.trackingNumber}`,
          sourceEntity: "Compensation",
          sourceId: settlement.id,
          recordedById: user.id,
        });
      }

      await logEvent(tx, {
        exceptionId: exception.id,
        action: "compensation.recorded",
        // Deliberately no amount and no currency. The Dar floor reads this
        // timeline, and the owner's rule is that the warehouse never sees
        // prices. What it does say is enough to work the case: whether the
        // money has gone out, when, and how.
        note:
          (existing ? "Compensation record amended by Finance." : "Compensation recorded by Finance.") +
          (input.paidAt
            ? ` Paid ${formatDate(input.paidAt)}${input.method ? ` by ${PAYMENT_METHOD_LABELS[input.method]}` : ""}.`
            : " Payment still pending."),
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.compensate",
          entity: "Compensation",
          entityId: settlement.id,
          summary: `${existing ? "Amended" : "Recorded"} compensation on ${exception.shipment.trackingNumber}`,
          // The one place the figures are written in full. audit.view is the
          // CEO's alone.
          metadata: {
            exceptionId: exception.id,
            shipment: exception.shipment.trackingNumber,
            amount: amount.toFixed(2),
            currency: input.currency,
            paidAt: input.paidAt ? input.paidAt.toISOString() : null,
            method: input.method,
            account: account?.name ?? null,
            note: input.note,
            previous: existing
              ? {
                  amount: existing.amount.toFixed(2),
                  currency: existing.currency,
                  paidAt: existing.paidAt ? existing.paidAt.toISOString() : null,
                  method: existing.method,
                  accountId: existing.accountId,
                }
              : null,
          },
        },
        tx
      );

      const audience = new Set<string>(
        await desksHolding(["user.manage", "ticket.manage"], tx)
      );
      if (exception.assignedToId) audience.add(exception.assignedToId);
      audience.delete(user.id);

      await notify(
        {
          userIds: [...audience],
          kind: "exception.compensationRecorded",
          title: `Compensation ${input.paidAt ? "paid" : "recorded"} — ${exception.shipment.trackingNumber}`,
          // No figure in the notification either. A notification body is the
          // one string in this system that is rendered without a permission
          // check anywhere near it.
          body: input.paidAt
            ? `Finance has paid out on this investigation${input.method ? ` by ${PAYMENT_METHOD_LABELS[input.method]}` : ""}.`
            : "Finance has recorded a settlement; the payment has not gone out yet.",
          href: `/app/cargo/${exception.shipment.id}`,
        },
        tx
      );

      return exception.shipment.id;
    });

    revalidatePath("/app/exceptions");
    revalidatePath(`/app/exceptions/${input.exceptionId}`);
    revalidatePath(`/app/cargo/${shipmentId}`);
    revalidatePath("/app/finance");
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------------------------- *
 * Closing a case
 * ------------------------------------------------------------------------- */

/**
 * Which extra fields each outcome demands.
 *
 * Exhaustive over ResolutionType on purpose: adding an outcome to the enum
 * fails this build until somebody says what evidence it requires, which is the
 * only thing stopping a new option from quietly closing cases with nothing
 * recorded.
 */
const REQUIRED_BY_TYPE: Record<ResolutionType, readonly string[]> = {
  // Nothing required. "We found it" is a complete answer, and the location is
  // offered as a courtesy to whoever looks next time.
  CARGO_FOUND: [],
  WEIGHT_CORRECTED: ["weightWasKg", "weightNowKg"],
  DAMAGE_SETTLED: ["damageOutcome"],
  CARGO_LOST: [],
  OTHER: [],
};

/** Fields on this outcome that are numbers, not text. */
const DECIMAL_FIELDS = new Set(["weightWasKg", "weightNowKg"]);

const FIELD_LABELS: Record<string, string> = {
  weightWasKg: "the previous weight",
  weightNowKg: "the actual weight",
  damageOutcome: "how the damage was settled",
};

/**
 * The same three fields, as whole sentences rather than as a noun dropped into
 * one.
 *
 * `Enter ${label}.` only works in a language that puts the verb first. Written
 * out in full, each message is one dictionary key and reads correctly in
 * Chinese as well; the label map above stays for a field nobody has written a
 * sentence for yet.
 */
const FIELD_REQUIRED_MESSAGES: Record<string, string> = {
  weightWasKg: "Enter the previous weight.",
  weightNowKg: "Enter the actual weight.",
  damageOutcome: "Enter how the damage was settled.",
};

const FIELD_NUMBER_MESSAGES: Record<string, string> = {
  weightWasKg: "The previous weight must be a number in kilograms.",
  weightNowKg: "The actual weight must be a number in kilograms.",
};

const isResolutionType = (v: string): v is ResolutionType =>
  Object.prototype.hasOwnProperty.call(REQUIRED_BY_TYPE, v);

/**
 * Close an investigation, with an answer attached.
 *
 * The owner's rule is that a case cannot be closed without a resolution type,
 * an explanation and a deliberate confirmation. All three are checked HERE
 * rather than in the form: `required` on an input is a hint to a browser, not a
 * rule, and this action is reachable without one.
 *
 * Nothing is overwritten. The original description, severity, photos, reporter
 * and raise date all stay exactly as they were — a resolution is an addition to
 * the record, not a replacement for it.
 */
export async function resolveInvestigation(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("exception.close");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const exceptionId = String(formData.get("exceptionId") ?? "");
  const rawType = String(formData.get("resolutionType") ?? "");
  const note = String(formData.get("resolutionNote") ?? "").trim();
  const confirmed = formData.get("confirm") === "yes";

  if (!exceptionId) return fail(t(locale, "Missing case."));
  if (!rawType) {
    return fail(t(locale, "Choose what happened before closing the case."));
  }
  if (!isResolutionType(rawType)) {
    return fail(t(locale, "That is not a resolution type."));
  }
  // Cargo Found is the one outcome that closes without an explanation. Every
  // other outcome closes a case that cost somebody something, and a year from
  // now the only record of why will be this sentence.
  if (RESOLUTION_NOTE_REQUIRED.includes(rawType) && note.length < 10) {
    // The outcome sits in the middle of the sentence in both languages, so it
    // is interpolated between two fragments rather than baked into one key.
    // `.toLowerCase()` after `t` is a no-op on Chinese and still lowercases the
    // English label — the dictionary is keyed on the capitalised label.
    const outcome = t(locale, RESOLUTION_TYPE_LABELS[rawType]).toLowerCase();
    return fail(
      `${t(locale, "Say what happened and how it was solved —")} ${outcome} ${t(locale, "cannot be filed without it.")}`
    );
  }
  if (!confirmed) {
    return fail(t(locale, "Tick the confirmation before closing the case."));
  }

  const detail: Record<string, unknown> = {};
  for (const field of REQUIRED_BY_TYPE[rawType]) {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) {
      return fail(
        t(
          locale,
          FIELD_REQUIRED_MESSAGES[field] ??
            `Enter ${FIELD_LABELS[field] ?? field}.`
        )
      );
    }

    if (DECIMAL_FIELDS.has(field)) {
      // Decimal from the string, never parseFloat. A weight that goes through a
      // float is a weight that can print 22.999999999999996 on an invoice.
      if (!/^\d+(\.\d+)?$/.test(raw)) {
        return fail(
          t(
            locale,
            FIELD_NUMBER_MESSAGES[field] ??
              `${FIELD_LABELS[field]} must be a number in kilograms.`
          )
        );
      }
      detail[field] = new Prisma.Decimal(raw);
    } else {
      detail[field] = raw;
    }
  }

  // Optional extras, taken only where the outcome uses them.
  if (rawType === "CARGO_FOUND") {
    const where = String(formData.get("foundLocation") ?? "").trim();
    if (where) detail.foundLocation = where;
  }
  if (rawType === "CARGO_LOST") {
    detail.compensationOwed = formData.get("compensationOwed") === "yes";
    detail.financeNotified = formData.get("financeNotified") === "yes";
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.shipmentException.findUnique({
        where: { id: exceptionId },
        select: {
          id: true,
          status: true,
          shipmentId: true,
          type: true,
          compensation: { select: { id: true } },
        },
      });
      if (!existing) throw new Error(t(locale, "Case not found."));
      if (EXCEPTION_TERMINAL_STATUSES.includes(existing.status as never)) {
        throw new Error(t(locale, "This case is already closed."));
      }

      // The owner's CANNOT list: the warehouse may close a case it solved, but
      // not one with money attached. A permission alone cannot express that —
      // whether a payout exists is a fact about this row, not about the user —
      // so the rule lives here.
      if (existing.compensation && !can(user.role, "exception.compensate")) {
        throw new Error(
          t(
            locale,
            "This case has a compensation attached. Only Finance or the CEO can close it."
          )
        );
      }

      await tx.shipmentException.update({
        where: { id: exceptionId },
        data: {
          status: "RESOLVED",
          resolutionType: rawType,
          resolutionNote: note,
          resolvedById: user.id,
          resolvedAt: new Date(),
          ...detail,
        },
      });

      await tx.exceptionEvent.create({
        data: {
          exceptionId,
          action: "closed",
          note: `${RESOLUTION_TYPE_LABELS[rawType]} — ${note}`,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.resolve",
          entity: "ShipmentException",
          entityId: exceptionId,
          summary: `Closed as ${RESOLUTION_TYPE_LABELS[rawType]}`,
        },
        tx
      );
    });

    // Cargo Found restores the shipment and re-ticks its boxes. That logic
    // already exists in markCargoFound and is NOT copied here — a second
    // implementation of "put the cargo back" is two things to keep in step.
    // The form points the operator at that action for this outcome; closing as
    // CARGO_FOUND here only records the answer.
    revalidatePath("/app/exceptions");
    revalidatePath("/app/inventory");
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
