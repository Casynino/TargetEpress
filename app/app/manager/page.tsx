import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Manager" };

/**
 * The manager's command centre.
 *
 * A placeholder that exists so the route, the guard and the menu are real
 * before the dashboard is built on top of them — the alternative is a sidebar
 * row pointing at a 404, which is how Credit shipped the first time.
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
          "The whole business on one screen — what moved, what it earned, what is owed and what needs a decision."
        )}
      />
      <p className="text-sm text-muted-foreground">
        {user.name}
      </p>
    </>
  );
}
