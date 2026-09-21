"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";

/*
  A PAGE OPENED BEFORE AN UPDATE, USED AFTER IT.

  A phone at the Dar counter keeps a tab open for days. When a new version of
  the app goes live in the meantime, the page in that tab still carries the old
  version's buttons: pressing one asks the server for code it no longer has, or
  the browser for a file that is gone. Next.js answers with an error thrown in
  the browser — no reference, because the server never saw it — and "Try again"
  re-renders the same stale page, so the warehouse was left pressing a button
  that could never work and concluding that correcting a weight had been taken
  away from them.

  These are recognised by what they say, and the answer is the one that works:
  load the page again. Once on its own, so the clerk mostly never sees this
  screen; if it comes straight back, it stays and says why, with a button that
  really reloads instead of re-rendering.
*/
const STALE = [
  /Server Action .* was not found on the server/i,
  /UnrecognizedActionError/i,
  /older or newer deployment/i,
  /ChunkLoadError/i,
  /Loading (CSS )?chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

const RELOADED_AT = "te:stale-reload-at";

function isStale(error: Error) {
  const text = `${error.name} ${error.message}`;
  return STALE.some((pattern) => pattern.test(text));
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /* The screen a person meets when something has already gone wrong is the
     worst one to hand them in a language they do not read. */
  const t = useT();
  const stale = isStale(error);

  useEffect(() => {
    // Surfaced in the Vercel function logs, keyed by digest.
    console.error("Operations error:", error);
    if (!stale) return;
    /* One automatic reload per half minute. Storage can be unavailable (a
       private window); then the button below is the way through. */
    try {
      const last = Number(window.sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last > 30_000) {
        window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* Nothing to do: the screen explains itself. */
    }
  }, [error, stale]);

  if (stale) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          <RefreshCw className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
          {t("The system was updated")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            "This page was opened before the latest update, so that last step was not saved. Reload the page and do it again."
          )}
        </p>
        <Button
          variant="brand"
          className="mt-6 rounded-xl"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("Reload the page")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        {t("Something went wrong")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t(
          "Nothing was saved. Try again — if it keeps happening, tell the CEO and quote this reference."
        )}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="brand" className="rounded-xl" onClick={reset}>
          {t("Try again")}
        </Button>
        {/* Try again re-renders the page it is on. An error the server never
            saw — no reference above — usually needs the page itself fetched
            again, which only a reload does. */}
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => window.location.reload()}
        >
          {t("Reload the page")}
        </Button>
      </div>
    </div>
  );
}
