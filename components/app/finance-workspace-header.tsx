import { Suspense } from "react";
import type { Role } from "@prisma/client";

import { FinanceActions } from "@/components/app/finance-actions";
import { FinanceNav } from "@/components/app/finance-nav";
import { PageHeader } from "@/components/app/page-header";
import { activeAccounts } from "@/lib/accounts";
import { COMMON_EXPENSES } from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { viewerLocale } from "@/lib/viewer";

/**
 * WHO THIS DEPARTMENT IS, SAID ONCE.
 *
 * Nine tabs sat under nine different page headers: nine titles, nine
 * descriptions, and a toolbar that appeared on three of them and vanished on
 * the rest. Pressing General ledger and then Accounts lost four buttons, a
 * title and a sentence in one click — so a tab, which promises to change only
 * the list below it, read as leaving for an unrelated page. The owner said so
 * about Collections; this is the same thing, nine times over.
 *
 * Rendered by every page that carries the Finance tab row, rather than by a
 * layout, because a layout at /app/finance would also wrap the detail
 * pages — one payment, one account, one invoice — which are real destinations
 * with their own headings and their own way back.
 *
 * THE SENTENCE HAS TO BE TRUE ON EVERY TAB, so it names the department rather
 * than one screen. What each tab is for is said by the tab itself, which is
 * lit, and by the caption each page keeps above its own content.
 */
export async function FinanceWorkspaceHeader({ role }: { role: Role }) {
  const locale = await viewerLocale();
  const [accounts, rateRow] = await Promise.all([
    activeAccounts(),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const canTakeMoney = can(role, "payment.record");
  const canRecordCost = can(role, "expense.record");
  const canAskForCredit = can(role, "credit.request");
  const anyAction = canTakeMoney || canRecordCost || canAskForCredit;

  return (
    <>
      <PageHeader
        title={t(locale, "Finance")}
        description={t(
          locale,
          "What the business holds, what it is owed, what it has spent, and every movement between them."
        )}
        actions={
          anyAction ? (
            <Suspense fallback={null}>
              <FinanceActions
                accounts={accounts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  currency: a.currency,
                  accountNumber: a.accountNumber,
                  /* Needed to tell a till from a bank: transport is settled
                     out of cash or the Lipa number, never a bank. */
                  kind: a.kind,
                }))}
                quickExpenses={COMMON_EXPENSES}
                rate={rate}
                canTakeMoney={canTakeMoney}
                canRecordCost={canRecordCost}
                canAskForCredit={canAskForCredit}
                canDecideCredit={can(role, "credit.approve")}
              />
            </Suspense>
          ) : null
        }
      />

      <FinanceNav tabs={financeTabs(role)} />
    </>
  );
}
