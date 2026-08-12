import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * The bell.
 *
 * One icon, top right, on every screen. It was a sidebar link, which meant it
 * sat in a list you stop reading after a week and gave no hint that anything
 * was waiting. A count on an icon is the only part anyone actually looks at.
 *
 * The badge shows an exact number up to nine, then "9+". Nobody clears
 * twenty-three notifications one at a time, and the difference between 23 and
 * 24 changes nothing about what they do next.
 */
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/app/notifications"
      aria-label={
        unread === 0
          ? "Notifications"
          : `Notifications, ${unread} unread`
      }
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-xs font-bold leading-none text-signal-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
