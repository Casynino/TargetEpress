"use client";

import { Eye } from "lucide-react";
import { useFormStatus } from "react-dom";

import { stopWorkingAs } from "@/lib/actions/developer";

function StopButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-900 hover:bg-white/90 disabled:opacity-60"
    >
      {pending ? "Stopping…" : "Stop"}
    </button>
  );
}

/**
 * WHO THE DEVELOPER IS LOOKING AS — A SLIM BAR AT THE TOP OF THE PAGE.
 *
 * It was a pill floating in the corner, and it sat on top of whatever was
 * under it: a card's figure on a laptop, a button on a phone. The owner asked
 * for the page to look exactly as the person sees it, so the bar now stands IN
 * the page, above the content, and pushes it down rather than covering it.
 *
 * Violet, the Developer's own colour and one nothing else in the application
 * uses, so a page that is otherwise identical to the staff one is still never
 * mistaken for it. Everything done under it is recorded as the Developer.
 */
export function DeveloperBanner({
  workingAs,
}: {
  workingAs: { name: string; roleLabel: string };
}) {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-xl bg-violet-700 px-3.5 py-2 text-sm text-white shadow-sm print:hidden"
    >
      <Eye className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">Working as {workingAs.name}</span>
        <span className="hidden text-white/75 sm:inline">
          {" "}· {workingAs.roleLabel} · everything you do is recorded as you
        </span>
      </p>
      <form action={stopWorkingAs} className="shrink-0">
        <StopButton />
      </form>
    </div>
  );
}
