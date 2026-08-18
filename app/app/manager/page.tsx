import type { Metadata } from "next";

import { ExecutiveDashboard } from "@/app/app/dashboard/executive";
import { DeskHero } from "@/components/app/desk-hero";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
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
 *
 * That sameness now reaches the top of the page too. This opened on a plain
 * title bar while every other desk was greeted by name, which said the manager
 * was a section of the system rather than a person running it.
 */
export default async function ManagerHome() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();

  // Read the name from the record, not the session. The session token carries
  // whatever the name was at sign-in, so someone who renames themselves would
  // be greeted by their old name until they signed out and back in.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  });
  const firstName = (me?.name ?? user.name).split(" ")[0];

  const today = new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <DeskHero
        firstName={firstName}
        role={user.role}
        today={today}
        // What this chair is for: the whole company, not one department's
        // corner of it — and the half of that which is standing still until
        // this person decides something.
        subtitle={t(
          locale,
          "Here is the whole business, and what is waiting on you."
        )}
        search={{ action: "/app/search" }}
      />
      <ExecutiveDashboard role={user.role} />
    </>
  );
}
