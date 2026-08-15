import type { Metadata } from "next";

import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/app/page-header";
import { VerifyQueue } from "@/components/app/verify-queue";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Verify payments" };

/**
 * The verification queue, as a tab of Collections.
 *
 * Finance works the money end to end in this workspace — what is owed, what
 * Support has collected against it, what has been agreed — and the queue is the
 * middle step. Reaching it used to mean /app/finance/verify, which carries the
 * General ledger's tabs, so pressing "Verify payments" swapped the whole row of
 * tabs underneath the person and dropped them in the ledger. That is a
 * different workspace, not a different page.
 *
 * The queue is VerifyQueue, shared with the ledger's copy of this screen. Same
 * rows, same actions, same server action — only the navigation above differs.
 *
 * Gated on payment.verify, not collections.view: Support reaches every other
 * tab in this row and must not reach this one.
 */
export default async function CollectionsVerifyPage() {
  const user = await requirePermission("payment.verify");

  return (
    <>
      <PageHeader
        title="Verify payments"
        description="Claims Customer Support has collected from customers. Nothing is settled and no cargo is released until you agree."
      />
      {/*
        The finance tab row stays put.

        Collections is a tab of Finance AND a workspace of its own, so opening
        it used to swap the whole tab row out — and getting back to the ledger
        or the overview meant going down to the sidebar. The owner called that
        inconvenient and he is right: a tab that removes its own tab bar leaves
        the reader with nowhere to go but back.

        Two rows, but hierarchical rather than identical: where you are in
        Finance, then where you are inside Collections. Only shown to a reader
        who has the finance tabs at all — Support shares this workspace and
        must not be given doors it cannot open.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceNav tabs={financeTabs(user.role)} />
      ) : null}

      <CollectionsNav canVerify />

      <VerifyQueue />
    </>
  );
}
