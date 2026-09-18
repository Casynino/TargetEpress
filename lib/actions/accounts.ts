"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { formatMoney, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextTransferNumber } from "@/lib/ids";
import { LIVE_LEG, postLedgerEntry } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";
import { viewerLocale } from "@/lib/viewer";

const closeSchema = z.object({
  accountId: z.string().min(1, "Say which account is being closed."),
  intoAccountId: z.string().min(1, "Choose the account its money moves to."),
  reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
});

export type CloseAccountResult = {
  /** What was on the account and moved, in its own currency; below zero if it was overdrawn. */
  moved: number;
  transferNumber: string | null;
};

/**
 * CLOSE AN ACCOUNT, AND SEND WHAT IS ON IT SOMEWHERE THAT IS STILL OPEN.
 *
 * Two tills becoming one — M-Pesa and Mixx by Yas kept as a single "Lipa"
 * account at the office — was only ever possible with hand-written SQL, and
 * the obvious SQL (switching the old rows off) hid their money: the owner's
 * dashboard reads open accounts only while the Accounts page reads all of
 * them, so the two screens stopped agreeing by exactly what was left behind.
 *
 * So closing is one act, done here, in one transaction:
 *   - whatever is on the account moves to the chosen one as an ordinary
 *     transfer on the register — valued at the closing account's own dollar
 *     figure, so it reads zero in both columns afterwards;
 *   - claims still waiting for Finance, costs not yet paid and payroll not yet
 *     paid that name it are pointed at the new account, since none of them
 *     has moved money yet and each would otherwise be refused at the last step;
 *   - the account is switched off, so no picker offers it again.
 *
 * Its history is not touched. Payments, costs and ledger lines keep the
 * account they really used; receipts already given keep saying so.
 *
 * Also the way to sweep a closed account that something later posted to — a
 * cancelled old payment reverses on the account it came in on — so a closed
 * account with money on it is offered the same button, as "move what is left".
 */
export async function closeAccount(
  _prev: ActionResult<CloseAccountResult> | undefined,
  formData: FormData
): Promise<ActionResult<CloseAccountResult>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("account.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = closeSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;
  if (input.accountId === input.intoAccountId) {
    return fail(t(locale, "An account cannot be closed into itself. Choose another account."));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      /*
        Both rows, in a fixed order, so two desks closing accounts into each
        other cannot each wait on the other. Every new ledger line takes a
        share lock on its account first (postLedgerEntry), which this blocks:
        a payment or cost already posting to the account finishes before the
        balance below is read, and one that starts now waits, finds the
        account closed and is refused — so nothing lands on it unseen.
      */
      const ids = [input.accountId, input.intoAccountId].sort();
      await tx.$queryRaw`SELECT "id" FROM "CompanyAccount" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;

      const [account, into] = await Promise.all(
        [input.accountId, input.intoAccountId].map((id) =>
          tx.companyAccount.findUnique({
            where: { id },
            select: {
              id: true,
              name: true,
              kind: true,
              currency: true,
              active: true,
              openingSetAt: true,
            },
          })
        )
      );
      if (!account) throw new Error(t(locale, "That account no longer exists."));
      if (!into) throw new Error(t(locale, "The account chosen to receive its money no longer exists."));
      if (account.kind === "LOAN" || into.kind === "LOAN") {
        throw new Error(
          t(locale, "A loan is not closed here — it is paid off on the Loans page, and its money never moves into a company account this way.")
        );
      }
      if (!into.active) {
        throw new Error(`${into.name} ${t(locale, "is closed itself. Choose an account that is still open.")}`);
      }
      /*
        An account nobody gave an opening balance holds only what moved
        through it here — not what was already in it. Closed like that, the
        money that was on the phone before the system started could never be
        entered: a closed account takes no opening balance, and Lipa was born
        with one. So the opening figure comes first, even if it was nothing.
      */
      if (account.active && account.openingSetAt === null) {
        throw new Error(
          `${account.name} ${t(locale, "has no opening balance yet. Set it on the Accounts page first — even if it was zero — so money that was in it before the system started is not lost when it closes.")}`
        );
      }
      if (into.currency !== account.currency) {
        throw new Error(
          `${account.name} ${t(locale, "is in")} ${account.currency} ${t(locale, "and")} ${into.name} ${t(locale, "is in")} ${into.currency}. ${t(locale, "Choose an account in the same currency.")}`
        );
      }

      /* What is on it: live lines only — a cancelled pair moved nothing — in
         the account's own currency, and its own dollar figure beside it. */
      const sums = await tx.ledgerEntry.groupBy({
        by: ["direction"],
        where: { accountId: account.id, ...LIVE_LEG },
        _sum: { amount: true, amountUsd: true },
      });
      const side = (dir: "IN" | "OUT", key: "amount" | "amountUsd") =>
        toNumber(sums.find((row) => row.direction === dir)?._sum[key] ?? 0);
      const balance = Math.round((side("IN", "amount") - side("OUT", "amount")) * 100) / 100;
      const balanceUsd = Math.round((side("IN", "amountUsd") - side("OUT", "amountUsd")) * 100) / 100;
      const hasMoney = Math.abs(balance) >= 0.005;

      if (!account.active && !hasMoney) {
        throw new Error(`${account.name} ${t(locale, "is already closed, and nothing is left on it.")}`);
      }

      if (account.active) {
        const claimed = await tx.companyAccount.updateMany({
          where: { id: account.id, active: true },
          data: { active: false },
        });
        if (claimed.count === 0) {
          throw new Error(`${account.name} ${t(locale, "was closed by someone else a moment ago. Reload the page.")}`);
        }
      }

      /* Waiting work follows the money. None of it has touched an account
         yet, and each piece would be refused against a closed one. A fare can
         only be settled from cash or mobile money, so a claim's transport
         source moves only if the new account is one of those; otherwise
         Finance names one when verifying, as it can today. */
      const fareCapable = into.kind === "CASH" || into.kind === "MOBILE_MONEY";
      const [claims, claimFares, costs, runs] = await Promise.all([
        tx.paymentSubmission.updateMany({
          where: { accountId: account.id, status: "PENDING" },
          data: { accountId: into.id },
        }),
        fareCapable
          ? tx.paymentSubmission.updateMany({
              where: { transportSourceId: account.id, status: "PENDING" },
              data: { transportSourceId: into.id },
            })
          : Promise.resolve({ count: 0 }),
        tx.expense.updateMany({
          where: { accountId: account.id, status: { in: ["PENDING", "APPROVED"] } },
          data: { accountId: into.id },
        }),
        tx.payrollRun.updateMany({
          where: { accountId: account.id, status: { not: "PAID" } },
          data: { accountId: into.id },
        }),
      ]);

      let transferNumber: string | null = null;
      if (hasMoney) {
        const occurredAt = new Date();
        const amount = Math.abs(balance);
        /*
          Valued at the closing account's own dollar figure, so it ends at zero
          in both columns and the dollar total across the company does not
          move. Only if that figure makes no sense beside the shilling one —
          zero, or the other way round — is the published rate used instead.
        */
        let amountUsd = Math.abs(balanceUsd);
        /* The rate each leg states: the published one when the dollar figure
           had to come from it, otherwise the one the two figures imply. A few
           shillings round to USD 0.00, and dividing by that was an infinite
           rate the database refused. */
        let legRate: number | null = null;
        if (account.currency === "USD") {
          amountUsd = amount;
        } else if (amountUsd < 0.005 || Math.sign(balanceUsd) !== Math.sign(balance)) {
          const rate = await currentRateValue();
          if (!rate) {
            throw new Error(
              t(locale, "No exchange rate has been published, so this cannot be valued in dollars for the reports. Publish a USD→TZS rate first.")
            );
          }
          amountUsd = Math.round((amount / rate) * 100) / 100;
          legRate = rate;
        } else {
          legRate = Math.round((amount / amountUsd) * 10_000) / 10_000;
        }

        /* Money leaves whichever side holds it: an overdrawn account is made
           whole from the new one. */
        const [from, to] = balance > 0 ? [account, into] : [into, account];
        const number = await nextTransferNumber(tx, occurredAt.getFullYear());
        const reason = withNote(`Closing ${account.name}`, input.reason);
        const transfer = await tx.accountTransfer.create({
          data: {
            transferNumber: number,
            fromAccountId: from.id,
            toAccountId: to.id,
            amountOut: new Prisma.Decimal(amount),
            amountIn: new Prisma.Decimal(amount),
            exchangeRate: null,
            fee: new Prisma.Decimal(0),
            reason,
            occurredAt,
            recordedById: user.id,
          },
        });
        for (const leg of [
          { acct: from, direction: "OUT" as const, kind: "TRANSFER_OUT" as const, text: `to ${to.name}` },
          { acct: to, direction: "IN" as const, kind: "TRANSFER_IN" as const, text: `from ${from.name}` },
        ]) {
          await postLedgerEntry(tx, {
            accountId: leg.acct.id,
            currency: account.currency,
            direction: leg.direction,
            kind: leg.kind,
            amount,
            amountUsd,
            exchangeRate: legRate,
            occurredAt,
            description: `${number} — ${leg.text} — ${reason}`,
            sourceEntity: "AccountTransfer",
            sourceId: transfer.id,
            transferId: transfer.id,
            recordedById: user.id,
            onClosedAccount: true,
          });
        }
        transferNumber = number;
      }

      const followed = [
        claims.count + claimFares.count > 0 ? `${claims.count + claimFares.count} waiting claim(s)` : null,
        costs.count > 0 ? `${costs.count} unpaid cost(s)` : null,
        runs.count > 0 ? `${runs.count} payroll run(s)` : null,
      ].filter(Boolean);
      await recordAudit(
        {
          actor: user,
          action: account.active ? "account.close" : "account.sweep",
          entity: "CompanyAccount",
          entityId: account.id,
          summary: withNote(
            `${account.active ? "Closed" : "Emptied closed account"} ${account.name}` +
              (!hasMoney
                ? "; nothing was on it"
                : balance > 0
                  ? `; ${formatMoney(balance, account.currency)} moved to ${into.name} on ${transferNumber}`
                  : `; overdrawn by ${formatMoney(-balance, account.currency)}, made good from ${into.name} on ${transferNumber}`) +
              (followed.length ? `; ${followed.join(", ")} now name ${into.name}` : ""),
            input.reason
          ),
          metadata: {
            account: account.name,
            into: into.name,
            balance,
            balanceUsd,
            transferNumber,
            claims: claims.count,
            claimFares: claimFares.count,
            costs: costs.count,
            payrollRuns: runs.count,
          },
        },
        tx
      );

      return { moved: balance, transferNumber };
    });

    for (const path of [
      "/app/finance/accounts",
      "/app/finance/transactions",
      "/app/finance",
      "/app/dashboard",
      "/app/finance/payroll",
      "/app/collections/submissions",
    ]) {
      revalidatePath(path);
    }
    return ok(result);
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
