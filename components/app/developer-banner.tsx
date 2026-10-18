"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useFormStatus } from "react-dom";

import { stopWorkingAs } from "@/lib/actions/developer";

const KEY = "tx.workas.collapsed";

function StopButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-white/90 disabled:opacity-60"
    >
      {pending ? "Stopping…" : "Stop"}
    </button>
  );
}

/**
 * WHO THE DEVELOPER IS LOOKING AS, WITHOUT TAKING A STRIP OF THE SCREEN.
 *
 * A small pill floating in the corner, only while "Work as" is on. It can be
 * folded down to a round eye button — the Developer knows who they opened — and
 * unfolds again with one press. It holds no layout space, so the page under it
 * is exactly the page the person sees.
 *
 * Orange, a colour nothing else in the application uses, so a page that is
 * otherwise identical to the staff one is still never mistaken for it.
 * Everything under it is view-only, which is what makes folding it safe.
 */
export function DeveloperBanner({
  workingAs,
}: {
  workingAs: { name: string; roleLabel: string };
}) {
  const [collapsed, setCollapsed] = useState(false);

  /* Remembered for the tab, so a reload does not unfold what was folded. */
  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem(KEY) === "1");
    } catch {
      /* private window: it simply starts unfolded */
    }
  }, []);
  const fold = (on: boolean) => {
    setCollapsed(on);
    try {
      sessionStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* the fold still works for this page view */
    }
  };

  return (
    <div
      role="status"
      className="fixed bottom-20 right-3 z-[60] print:hidden lg:bottom-4 lg:right-4"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => fold(false)}
          aria-label={`Viewing as ${workingAs.name}. Show`}
          title={`Viewing as ${workingAs.name}`}
          className="focus-ring grid size-10 place-items-center rounded-full bg-orange-800 text-white shadow-lg hover:bg-orange-700"
        >
          <Eye className="size-4" />
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full bg-orange-800 py-1.5 pl-3.5 pr-1.5 text-sm text-white shadow-lg">
          <Eye className="size-4 shrink-0" />
          <span className="max-w-[12rem] truncate sm:max-w-none">
            Viewing as <strong className="font-semibold">{workingAs.name}</strong>
            <span className="hidden text-white/75 sm:inline"> · {workingAs.roleLabel} · view only</span>
          </span>
          <form action={stopWorkingAs}>
            <StopButton />
          </form>
          <button
            type="button"
            onClick={() => fold(true)}
            aria-label="Fold away"
            className="focus-ring grid size-7 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
