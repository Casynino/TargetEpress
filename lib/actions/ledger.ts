"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { postLedgerEntry } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Cancelling a movement that should not have happened.
 *
 * The owner asked to be able to delete or edit lines in the register, and
 * chose to keep the trail. This is what that looks like: the row stays and is
 * struck through, and an opposite line is posted that points back at it, so
 * the account balance returns to where it should be AND the register can still
 * explain how it got there.
 *
 * That is not bureaucracy for its own sake. Every balance on every screen is
 * derived by summing these lines. Deleting one silently changes a bank figure
 * that somebody has already read, reconciled or sent to the boss, and leaves
 * nothing behind to explain the difference. A cancelled line changes the same
 * figure and says why.
 *
 * Two things are refused, both because the register would stop making sense:
 * a line already cancelled, and a line that is itself a cancellation.
 */
const schema = z.object({
  entryId: z.string().min(1),
  /* Optional. Warn, confirm, do — the reversing line names the entry it
     cancels and the audit line names who cancelled it and when, which is the
     part anybody reading the register afterwards actually needs. */
  reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
});

export async function cancelLedgerEntry(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    await prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.findUnique({
        where: { id: parsed.data.entryId },
        include: {
          account: { select: { name: true } },
          reversedBy: { select: { entryNumber: true } },
        },
      });
      if (!entry) throw new Error(t(locale, "That line no longer exists."));
      if (entry.reversedBy) {
        throw new Error(
          `${t(locale, "That line was already cancelled by")} ${entry.reversedBy.entryNumber}.`
        );
      }
      if (entry.reversesId) {
        throw new Error(
          t(
            locale,
            "That line is itself a cancellation. Cancelling it would put the money back — record a fresh movement instead."
          )
        );
      }

      /*
        A TRANSFER IS ONE MOVEMENT. IT COMES BACK AS ONE MOVEMENT.

        Moving TSh 500,000 from the bank to the cash tin posts two lines: OUT of
        the bank and IN to the tin. Cancelling the line the reader happened to
        click undid one half of that — the bank got its 500,000 back and the
        tin kept the 500,000 it had been given. The company's cash went up by
        half a million shillings because somebody corrected a mistake, and every
        balance, every reconciliation and every report agreed with it.

        Both legs travel together, always: they are one transfer, and the pair
        that made the money move is the pair that has to put it back. A leg
        somebody already cancelled on its own is skipped rather than reversed
        twice, so an account that was left half-undone by the old behaviour is
        finished off correctly by this one.
      */
      const legs = entry.transferId
        ? await tx.ledgerEntry.findMany({
            where: {
              transferId: entry.transferId,
              reversesId: null,
              reversedBy: { is: null },
            },
          })
        : [entry];

      for (const leg of legs) {
        await postLedgerEntry(tx, {
          accountId: leg.accountId,
          currency: leg.currency,
          direction: leg.direction === "OUT" ? "IN" : "OUT",
          kind: leg.kind,
          amount: toNumber(leg.amount),
          amountUsd: toNumber(leg.amountUsd),
          exchangeRate:
            leg.exchangeRate === null ? null : toNumber(leg.exchangeRate),
          /* Dated today, not on the original day. The money comes back now;
             backdating it would silently rewrite a month somebody has closed. */
          occurredAt: new Date(),
          description: withNote(
            `${t(locale, "Cancels")} ${leg.entryNumber}`,
            parsed.data.reason
          ),
          sourceEntity: leg.sourceEntity,
          sourceId: leg.sourceId,
          recordedById: user.id,
          reversesId: leg.id,
        });
      }

      /*
        AN OPENING BALANCE TAKEN BACK CAN BE GIVEN AGAIN.

        An account takes an opening balance exactly once, and the one-time
        stamp is what stops two of them racing each other. Cancelling the line
        is the statement that it never should have been there — but the stamp
        stayed, so the account was left at nothing with the door to setting one
        locked for good. The only way back was an adjustment posted under some
        other name, which is not what happened and not what the register should
        say happened.

        The stamp comes off with the line. Setting one again re-stamps it, so
        the race the stamp exists to stop is still stopped.
      */
      if (legs.some((leg) => leg.kind === "OPENING_BALANCE")) {
        for (const leg of legs.filter((l) => l.kind === "OPENING_BALANCE")) {
          await tx.companyAccount.updateMany({
            where: { id: leg.accountId },
            data: { openingSetAt: null },
          });
        }
      }

      await recordAudit(
        {
          actor: user,
          action: "ledger.cancel",
          entity: "LedgerEntry",
          entityId: entry.id,
          summary: withNote(
            legs.length > 1
              ? `${legs.map((l) => l.entryNumber).join(" and ")} cancelled — both legs of one transfer`
              : `${entry.entryNumber} cancelled`,
            parsed.data.reason
          ),
          metadata: {
            entryNumber: entry.entryNumber,
            /* Both, when it was a transfer — the register has to be able to
               say that cancelling one line moved two. */
            cancelled: legs.map((l) => l.entryNumber),
            transferId: entry.transferId,
            account: entry.account.name,
            amount: toNumber(entry.amount),
            currency: entry.currency,
            direction: entry.direction,
            reason: parsed.data.reason ?? null,
          },
        },
        tx
      );
    });

    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
