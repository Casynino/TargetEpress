import { Suspense } from "react";

import { CollectionsActions } from "@/components/app/collections-actions";
import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { PageHeader } from "@/components/app/page-header";
import { activeAccounts } from "@/lib/accounts";
import { financeTabs } from "@/lib/finance-tabs";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

/**
 * ONE PAGE, WITH TABS — NOT THREE PAGES THAT HAPPEN TO SHARE A TAB ROW.
 *
 * The owner pressed "With Finance" and felt he had left for somewhere else,
 * and he was right to: the title changed from "Payment follow-up" to
 * "Collection history", the description changed under it, and the row of
 * action buttons disappeared. Three tabs of one workspace, three page
 * identities. A tab is a promise that only the CONTENT below it changes.
 *
 * So the identity moved up here, where it is rendered once and cannot drift:
 * the title, the sentence under it, the Finance row, the workspace row, and
 * the three actions that answer the phone call this desk exists to answer.
 * Each page below now renders its own list and nothing else.
 *
 * THE DESCRIPTION HAS TO BE TRUE ON EVERY TAB, so it names the whole job
 * rather than one list — a sentence about who owes money would be wrong the
 * moment somebody clicked Sent back, which is how this started.
 */
export default async function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePermission("collections.view");
  const locale = await viewerLocale();

  /* Fetched here rather than on each page, because the toolbar is here now.
     The account list is read whichever desk is looking — canRecord below is
     what decides whether the panel banks money or hands it to Finance. */
  const [payAccounts, rateRow] = await Promise.all([
    activeAccounts(),
    currentRate(),
  ]);
  const liveRate = rateRow ? toNumber(rateRow.rate) : null;

  const canTakePayments = can(user.role, "payment.submit");

  return (
    <>
      <PageHeader
        title={t(locale, "Payment follow-up")}
        description={t(
          locale,
          "Who owes us money, what has gone to Finance, and what has come back."
        )}
        actions={
          canTakePayments ? (
            /* useSearchParams inside, for the sidebar's ?record=1 door. */
            <Suspense fallback={null}>
              <CollectionsActions
                accounts={payAccounts}
                rate={liveRate}
                canRecord={can(user.role, "payment.record")}
                canAdjust={can(user.role, "ledger.adjust")}
                canDiscount={can(user.role, "invoice.discount")}
                canChangeRate={can(user.role, "invoice.rate")}
                canWaiveStorage={can(user.role, "invoice.storage.waive")}
                canAskForCredit={can(user.role, "credit.request")}
                canDecideCredit={can(user.role, "credit.approve")}
              />
            </Suspense>
          ) : null
        }
      />

      {/*
        The finance tab row stays put.

        Collections is a tab of Finance AND a workspace of its own, so opening
        it used to swap the whole tab row out — and getting back to the ledger
        meant going down to the sidebar. Two rows, but hierarchical rather than
        identical: where you are in Finance, then where you are inside
        Collections. Only for a reader who has the finance tabs at all; Support
        shares this workspace and must not be given doors it cannot open.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceNav tabs={financeTabs(user.role)} />
      ) : null}

      {/* Reads the status off the query itself, because a layout is not given
          searchParams and the lit tab must follow the list being shown. */}
      <Suspense fallback={null}>
        <CollectionsNav canVerify={can(user.role, "payment.verify")} />
      </Suspense>

      {children}
    </>
  );
}
