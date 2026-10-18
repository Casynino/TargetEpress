"use client";

import Link from "next/link";
import { Eye, ShieldAlert, UserRound } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { logoutAction } from "@/lib/actions/auth";
import { stopWorkingAs } from "@/lib/actions/developer";

/**
 * THE ONE THING ON SCREEN THAT CANNOT BE MISTAKEN FOR THE STAFF APP.
 *
 * Fixed across the very top of every page while the session is the Developer's,
 * in a colour and a pattern nothing else in the application uses. The owner's
 * requirement is that it must be impossible to take Developer Mode for the
 * ordinary account at a glance — including from across a desk, including on a
 * page that is otherwise identical to a staff one — so it does not rely on a
 * label alone: the stripe is the part read at a distance.
 *
 * "Switch to staff login" signs out and returns to the login page rather than
 * swapping identities in place. The two accounts are separate people-in-the-
 * system with separate credentials, and a button that turned one into the
 * other would be the silent change this whole feature exists to rule out.
 */
export function DeveloperBanner({
  workingAs,
}: {
  /** Set while the Developer is looking at the app as somebody else. */
  workingAs?: { name: string; roleLabel: string } | null;
}) {
  const t = useT();
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-between gap-3 px-3 text-xs font-semibold text-white print:hidden"
      style={{
        /* Amber-violet while looking as someone, so the two states differ at a
           glance: plain violet is "I am the Developer", this is "I am the
           Developer, looking through somebody else's eyes". */
        backgroundColor: workingAs ? "#9a3412" : "#5b21b6",
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 10px, transparent 10px 20px)",
      }}
    >
      <span className="flex min-w-0 items-center gap-2 font-mono uppercase tracking-[0.12em]">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {workingAs
            ? `${t("DEVELOPER MODE")} · ${t("WORKING AS")} ${workingAs.name} (${t(workingAs.roleLabel)}) — ${t("view only, recorded as Developer")}`
            : t("DEVELOPER MODE — All actions are audited.")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {workingAs ? (
          <form action={stopWorkingAs}>
            <button
              type="submit"
              className="focus-ring flex items-center gap-1 rounded bg-white px-2 py-0.5 text-orange-900 hover:bg-white/90"
            >
              <Eye className="h-3 w-3" />
              {t("Stop working as them")}
            </button>
          </form>
        ) : (
          <Link
            href="/app/developer"
            className="hidden underline-offset-2 hover:underline sm:inline"
          >
            {t("Developer dashboard")}
          </Link>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            className="focus-ring flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
          >
            <UserRound className="h-3 w-3" />
            {t("Switch to staff login")}
          </button>
        </form>
      </span>
    </div>
  );
}
