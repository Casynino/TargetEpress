import type { Metadata } from "next";

import { ExecutiveDashboard } from "@/app/app/dashboard/executive";
import { PageHeader } from "@/components/app/page-header";
import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Command centre" };

/**
 * The manager's command centre.
 *
 * THE SAME SCREEN THE OWNER READS, and that is the whole design. A manager who
 * runs the company day to day and an owner who answers for it need the same
 * four desks, the same money, the same list of things going wrong — asking the
 * two of them to compare notes across two dashboards computing revenue two ways
 * is how a business ends up with two sets of books and a meeting about which is
 * right.
 *
 * The difference between the chairs is authority, not information, and authority
 * is already enforced where it belongs: on the permissions behind each action.
 * The manager reads everything and presses everything except the five the owner
 * keeps — who works here, what the service costs, what the company's own
 * settings say, which bank accounts exist, and destroying a record for good.
 */
export default async function ManagerHome() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();

  return (
    <>
      <PageHeader
        title={t(locale, "Command centre")}
        description={t(
          locale,
          "What moved, what it earned, what is owed, and what is waiting on a decision."
        )}
      />
      <ExecutiveDashboard role={user.role} />
    </>
  );
}
