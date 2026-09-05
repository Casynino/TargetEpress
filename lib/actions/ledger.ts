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

      await postLedgerEntry(tx, {
        accountId: entry.accountId,
        currency: entry.currency,
        direction: entry.direction === "OUT" ? "IN" : "OUT",
        kind: entry.kind,
        amount: toNumber(entry.amount),
        amountUsd: toNumber(entry.amountUsd),
        exchangeRate:
          entry.exchangeRate === null ? null : toNumber(entry.exchangeRate),
        /* Dated today, not on the original day. The money comes back now;
           backdating it would silently rewrite a month somebody has closed. */
        occurredAt: new Date(),
        description: withNote(
          `${t(locale, "Cancels")} ${entry.entryNumber}`,
          parsed.data.reason
        ),
        sourceEntity: entry.sourceEntity,
        sourceId: entry.sourceId,
        recordedById: user.id,
        reversesId: entry.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "ledger.cancel",
          entity: "LedgerEntry",
          entityId: entry.id,
          summary: withNote(`${entry.entryNumber} cancelled`, parsed.data.reason),
          metadata: {
            entryNumber: entry.entryNumber,
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
