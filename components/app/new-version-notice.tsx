"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * "A newer version is live."
 *
 * Every fix shipped to this business was followed by somebody being told to
 * hard-refresh before they could see it — and the desks that most needed the
 * fix are the ones least likely to think of that. Guangzhou kept a page open
 * all day and pressed a button that had already been repaired hours earlier.
 *
 * So the page asks. It compares the build it was loaded from against the one
 * the server is currently serving, and when they differ it offers a reload
 * rather than performing one: a warehouse clerk half-way through typing a
 * consignment must not have the form pulled out from under them. The choice
 * stays theirs, and the banner waits.
 *
 * Checked when the tab is looked at again rather than on a fast timer. Staff
 * leave this open beside WhatsApp all day, and coming back to it is exactly
 * the moment a stale page matters — a poll every few seconds would be a
 * thousand requests a day per phone to answer a question that changes twice.
 */
const EVERY = 5 * 60 * 1000;

export function NewVersionNotice({ build }: { build: string }) {
  const t = useT();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    /* A dev server rebuilds constantly and would cry wolf all day. */
    if (build === "development") return;

    let alive = true;

    async function check() {
      if (!alive || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { build?: string };
        /* Only ever set. Once a newer build exists, a network hiccup answering
           with the old one must not make the banner flicker away. */
        if (alive && data.build && data.build !== build) setStale(true);
      } catch {
        /* Offline, or the deploy is mid-flight. Silence is the right answer:
           this is a convenience, and it must never interrupt somebody's work
           to report its own failure. */
      }
    }

    const timer = setInterval(check, EVERY);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [build]);

  if (!stale) return null;

  /*
    OUT OF THE WAY, AND IN WORDS ABOUT THE READER.

    It sat centred across the top, over the page's own heading — the one place
    a notice can be while telling somebody their screen is stale, and it
    covered the thing they came to read. It sits in the corner now, clear of
    the header's own controls, where a message that is not urgent belongs.

    "A newer version is live" is a sentence about the software. What the clerk
    needs to know is about THEM: the screen they are looking at is old, which
    is why the button they just pressed behaved oddly. So it says that, and
    the button says what pressing it does.
  */
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[60] flex justify-end print:hidden lg:top-16">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card/95 py-1.5 pl-3.5 pr-1.5 shadow-lg backdrop-blur">
        <span className="text-xs font-medium">
          {t("This page is out of date")}
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground hover:bg-brand/90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("Refresh")}
        </button>
      </div>
    </div>
  );
}
