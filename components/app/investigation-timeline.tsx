import {
  Camera,
  CheckCircle2,
  Coins,
  Flag,
  MessageSquare,
  PackageSearch,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import {
  eventLabel,
  type InvestigationEvent,
} from "@/lib/investigation-lifecycle";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";

/**
 * The permanent record of what was done about a case.
 *
 * Oldest first, deliberately — the same direction the queue is sorted and the
 * direction a case actually reads: raised, looked for, customer called, payout
 * approved, closed. A newest-first log is a feed, and a feed is what you skim;
 * this is a document somebody will one day have to defend to a customer who
 * lost a carton.
 *
 * Nothing here can be edited or deleted: the model has no update path in the
 * application at all. A wrong note is corrected by writing another one, which
 * is what an audit trail means.
 */

const EVENT_ICONS: Record<string, LucideIcon> = {
  opened: Flag,
  "status.changed": CheckCircle2,
  "note.added": MessageSquare,
  "photo.added": Camera,
  "cargo.found": PackageSearch,
  assigned: UserCheck,
  "compensation.recorded": Coins,
  closed: CheckCircle2,
};

export function InvestigationTimeline({
  events,
  openedAt,
  openedByName,
  locale = "en",
}: {
  /** Already oldest-first from the server. */
  events: InvestigationEvent[];
  openedAt: Date;
  openedByName: string | null;
  /**
   * Handed down rather than hooked: this file carries no "use client" of its
   * own and is rendered from one that does, so a prop is the honest way in.
   */
  locale?: Locale;
}) {
  // Cases raised before the timeline existed have no "opened" row. The moment
  // the case was raised is a fact the exception itself carries, so the log
  // starts correctly either way rather than beginning mid-story.
  const hasOpened = events.some((event) => event.action === "opened");
  const entries: InvestigationEvent[] = hasOpened
    ? events
    : [
        {
          id: `${openedAt.getTime()}-opened`,
          action: "opened",
          note: null,
          actorName: openedByName,
          createdAt: openedAt,
        },
        ...events,
      ];

  return (
    <ol className="space-y-0">
      {entries.map((entry, index) => {
        const Icon = EVENT_ICONS[entry.action] ?? MessageSquare;
        const last = index === entries.length - 1;
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
                <Icon className="h-3 w-3" />
              </span>
              {last ? null : <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={last ? "min-w-0 pb-0" : "min-w-0 pb-3"}>
              <p className="text-xs font-medium">
                {eventLabel(entry.action)}
                <span className="ml-2 font-normal text-muted-foreground">
                  {formatDateTime(entry.createdAt, locale)}
                  {entry.actorName ? ` · ${entry.actorName}` : ""}
                </span>
              </p>
              {entry.note ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
