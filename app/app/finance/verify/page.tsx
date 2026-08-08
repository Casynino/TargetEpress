import type { Metadata } from "next";

import { FinanceNav } from "@/components/app/finance-nav";
import { PageHeader } from "@/components/app/page-header";
import { VerifyQueue } from "@/components/app/verify-queue";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Verify payments" };

/**
 * The verification queue, as a tab of the General ledger.
 *
 * The queue itself is VerifyQueue, shared with the Collections copy of this
 * screen — same rows, same actions, different row of tabs above them. See that
 * component for why the page is split this way.
 */
export default async function VerifyPaymentsPage() {
  const user = await requirePermission("payment.verify");

  return (
    <>
      <PageHeader
        title="Verify payments"
        description="Claims Customer Support has collected from customers. Nothing is settled and no cargo is released until you agree."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <VerifyQueue />
    </>
  );
}
