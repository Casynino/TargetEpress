import type { Metadata } from "next";

import { VerifyQueue } from "@/components/app/verify-queue";
import { requirePermission } from "@/lib/session";

/* The workspace first, the tab second — see the note on the submissions
   page. */
export const metadata: Metadata = {
  title: "Verify payments · Payment follow-up",
};

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
  /* The guard, not a value. The layout above renders this workspace's header
     and tabs; what is left here is the one thing this tab shows — and the one
     permission it needs, which is stricter than the layout's. */
  await requirePermission("payment.verify");

  return (
    <>
      <VerifyQueue />
    </>
  );
}
