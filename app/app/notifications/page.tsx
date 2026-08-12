import Link from "next/link";
import type { Metadata } from "next";
import { Bell, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { MarkAllReadButton } from "@/components/app/notification-actions";
import { formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Notifications" };

/**
 * What happened that concerns you.
 *
 * Scoped to the signed-in user by construction — there is no id in the URL and
 * no filter to widen. Read and unread live in one list rather than two tabs:
 * the useful question is "what has happened", and the unread ones are simply
 * the ones still marked.
 */
export default async function NotificationsPage() {
  const me = await requireUser();
  const locale = await viewerLocale();

  const rows = await prisma.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const unread = rows.filter((row) => !row.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread === 0
            ? "Nothing new."
            : `${unread} unread of the last ${rows.length}`
        }
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">{t(locale, "Nothing yet")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              locale,
              "You will hear about batches leaving China, cargo of yours that a manager edited, and company announcements."
            )}
          </p>
        </div>
      ) : (
        <ul className="panel divide-y">
          {rows.map((row) => {
            const body = (
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    row.readAt ? "bg-transparent" : "bg-brand"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      row.readAt ? "text-muted-foreground" : "font-medium"
                    )}
                  >
                    {row.title}
                  </p>
                  {row.body ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.body}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelative(row.createdAt, locale)}
                  </p>
                </div>
                {row.href ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
              </div>
            );

            return (
              <li key={row.id}>
                {row.href ? (
                  <Link
                    href={row.href}
                    className="block px-5 py-4 transition-colors hover:bg-accent"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
