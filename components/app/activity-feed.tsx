import Link from "next/link";
import {
  Banknote,
  Boxes,
  ClipboardCheck,
  LogIn,
  PackagePlus,
  Plane,
  QrCode,
  Settings,
  Truck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

/** Maps an audit action onto an icon and a colour, so the feed is scannable. */
const ACTION_STYLE: { test: RegExp; icon: LucideIcon; tone: string }[] = [
  { test: /^shipment\.create/, icon: PackagePlus, tone: "text-chart-1" },
  { test: /^shipment\.release/, icon: Truck, tone: "text-success" },
  { test: /^shipment\.cancel/, icon: Settings, tone: "text-destructive" },
  { test: /^batch\.depart/, icon: Plane, tone: "text-chart-2" },
  { test: /^batch\.(create|seal|addShipment|removeShipment)/, icon: Boxes, tone: "text-chart-1" },
  { test: /^batch\.(receive|verify|flag|completeVerification)/, icon: ClipboardCheck, tone: "text-warning" },
  { test: /^(payment|invoice)\./, icon: Banknote, tone: "text-success" },
  { test: /^pickupNote\./, icon: QrCode, tone: "text-signal" },
  { test: /^user\./, icon: UserCog, tone: "text-muted-foreground" },
  { test: /^auth\./, icon: LogIn, tone: "text-muted-foreground" },
];

function styleFor(action: string) {
  return (
    ACTION_STYLE.find((entry) => entry.test.test(action)) ?? {
      icon: Settings,
      tone: "text-muted-foreground",
    }
  );
}

export type ActivityEntry = {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

export async function ActivityFeed({
  entries,
  title = "Activity",
  description,
  href,
  className,
  showActor = true,
  emptyMessage = "No activity yet.",
}: {
  entries: ActivityEntry[];
  title?: string;
  description?: string;
  href?: string;
  className?: string;
  /**
   * Off when every row has the same author — a feed of your own work does not
   * need your name printed against each line.
   */
  showActor?: boolean;
  emptyMessage?: string;
}) {
  const locale = await viewerLocale();
  return (
    <section className={cn("panel flex flex-col", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">{t(locale, title)}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(locale, description)}
            </p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="focus-ring shrink-0 rounded-md text-xs font-medium text-brand hover:underline"
          >
            {t(locale, "View all")}
          </Link>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t(locale, emptyMessage)}
        </p>
      ) : (
        <ol className="max-h-[360px] overflow-y-auto px-5 py-2">
          {entries.map((entry, index) => {
            const { icon: Icon, tone } = styleFor(entry.action);
            const isLast = index === entries.length - 1;
            return (
              <li key={entry.id} className="flex gap-3">
                {/* Continuous rail: the feed reads as one thread of events
                    rather than a stack of unrelated rows. */}
                <div className="flex flex-col items-center">
                  <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-card">
                    <Icon className={cn("h-3.5 w-3.5", tone)} />
                  </span>
                  {!isLast ? <span className="my-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className={cn("min-w-0 flex-1", isLast ? "py-2" : "py-2 pb-3")}>
                  <p className="text-sm leading-snug">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {showActor
                      ? `${entry.actorName ?? t(locale, "System")} · ${formatRelative(entry.createdAt)}`
                      : formatRelative(entry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
