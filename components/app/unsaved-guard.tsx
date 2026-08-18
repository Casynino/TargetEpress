"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useT } from "@/components/app/locale-provider";

/**
 * "Discard unsaved changes?" — for the two forms long enough that losing them
 * hurts.
 *
 * WHY. Receiving cargo is fifteen fields, filled on a phone, in a warehouse,
 * while holding a carton. One tap on the back control and every one of them is
 * gone with no warning and no way to get them back. The desk that reported the
 * missing back button is the same desk that will now press it — the fix for one
 * problem is the cause of the other unless something asks first.
 *
 * WHAT DIRTY MEANS HERE. Not "the form was focused", not "a field was touched" —
 * the form's submittable data differs from what it was when the page rendered.
 * Typing three characters and deleting them again is not dirty, so the dialog
 * does not appear for someone who changed nothing. A warning that fires when
 * nothing was typed gets dismissed on reflex, and then it is ignored on the day
 * it was actually protecting ten fields.
 *
 * Only fields with a `name` count, because those are the ones this form saves.
 * The customer search box inside Receive cargo has no name — it is a lookup,
 * not data — and warning about an abandoned search term is exactly the noise
 * that teaches people to tap through the dialog.
 *
 * WHAT IT CATCHES, HONESTLY:
 *   - links (`<a href>`, which is every Next `<Link>`): intercepted in the
 *     capture phase before the router sees the click, so the dialog is raised
 *     instead of the navigation. Covers Cancel, the sidebar, the mobile drawer.
 *   - a real page unload (reload, closing the tab, an external link): the
 *     browser's own beforeunload prompt. Note that WeChat's ✕ tears the webview
 *     down and is under no obligation to run it — nothing in a page can promise
 *     otherwise.
 *
 * WHAT IT DOES NOT CATCH: anything that navigates by calling the router
 * directly, because a `<button>` that runs `router.back()` is indistinguishable
 * from a `<button>` that opens a panel — there is nothing in the DOM to read.
 * The mobile back control is the one that matters, and rather than guess (or
 * monkey-patch `history.back`, which risks killing the only way out of the app
 * in a browser that has no other one) this exports `confirmDiscard` for those
 * callers to opt in with one line. A guard that traps somebody on a page is
 * worse than one that misses.
 */

type Guard = { dirty: () => boolean; ask: (proceed: () => void) => void };

/**
 * Mounted guards. A set rather than a single slot because a page may hold more
 * than one guarded form; the first dirty one answers, so two forms never raise
 * two dialogs for one click.
 */
const GUARDS = new Set<Guard>();

function dirtyGuard(): Guard | null {
  for (const guard of GUARDS) if (guard.dirty()) return guard;
  return null;
}

/**
 * Run something that will throw away a filled-in form — a `router.back()`, a
 * panel that closes — asking first if anything was actually typed.
 *
 * Goes straight through when nothing is dirty, so callers can wrap
 * unconditionally without adding a dialog to the empty case.
 */
export function confirmDiscard(proceed: () => void): void {
  const guard = dirtyGuard();
  if (guard) guard.ask(proceed);
  else proceed();
}

/**
 * What the form currently holds, as one comparable string.
 *
 * Files are compared by name and size rather than identity: re-picking the same
 * photo produces a different File object, and that is not a change worth
 * stopping somebody over.
 */
function signature(form: HTMLFormElement): string {
  const parts: string[] = [];

  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      continue;
    }

    const key = element.name;
    if (!key) continue;

    if (element instanceof HTMLInputElement) {
      if (element.type === "file") {
        const files = Array.from(element.files ?? [])
          .map((file) => `${file.name}:${file.size}`)
          .join(",");
        parts.push(`${key}=${files}`);
        continue;
      }
      if (element.type === "checkbox" || element.type === "radio") {
        // Keyed by value too: a radio group shares one name, and only the
        // checked state of each option tells them apart.
        parts.push(`${key}:${element.value}=${element.checked ? "1" : "0"}`);
        continue;
      }
    }

    parts.push(`${key}=${element.value}`);
  }

  // Sorted so that a field appearing or moving in the DOM is not read as an
  // edit — only its value is.
  // Joined on a separator no field value can contain, so two different sets
  // of fields cannot collapse into the same string.
  return parts.sort().join("\u001f");
}

export function UnsavedGuard({
  savedKey,
}: {
  /**
   * Changes when the form has just been saved.
   *
   * Pass whatever the action hands back — an expense number, an id. Without it
   * a form that stays on screen after a successful save still looks different
   * from how it started, and the next tap warns about changes that are already
   * in the database.
   */
  savedKey?: string | number | null;
}) {
  const router = useRouter();
  const t = useT();

  const anchorRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const baselineRef = useRef<string | null>(null);
  const proceedRef = useRef<(() => void) | null>(null);
  const [asking, setAsking] = useState(false);

  /*
    Read on demand instead of tracked in state.

    A React `onChange` would miss anything set programmatically — the "usual
    costs" chips on the expense form fill the description without the browser
    ever firing an input event — and re-rendering a long form on every keystroke
    to maintain a boolean is a cost paid on the slowest phones in the building.
    Comparing the live DOM at the moment somebody tries to leave is both cheaper
    and more truthful.
  */
  const isDirty = useCallback(() => {
    const form = formRef.current;
    if (!form || baselineRef.current === null) return false;
    return signature(form) !== baselineRef.current;
  }, []);

  // The enclosing form, found rather than passed: placed inside the <form> it
  // cannot be wired to the wrong one, and neither form needs a ref threaded
  // through it. Outside a form it stays inert instead of guessing.
  useEffect(() => {
    const form = anchorRef.current?.closest("form") ?? null;
    formRef.current = form;
    baselineRef.current = form ? signature(form) : null;
  }, []);

  useEffect(() => {
    if (savedKey === undefined || savedKey === null) return;
    // Next frame, because React clears an uncontrolled form after a successful
    // action: re-reading immediately would take the pre-reset values as the new
    // baseline and leave the form permanently "dirty" after every save.
    const frame = requestAnimationFrame(() => {
      if (formRef.current) baselineRef.current = signature(formRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [savedKey]);

  useEffect(() => {
    const self: Guard = {
      dirty: isDirty,
      ask: (proceed) => {
        proceedRef.current = proceed;
        setAsking(true);
      },
    };
    GUARDS.add(self);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      // Still required by Chrome and Safari; the string itself is ignored.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // A modified click opens a tab or downloads; this page is not going
      // anywhere, so there is nothing to warn about.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;

      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (/^(mailto|tel|sms|javascript|blob|data):/i.test(href)) return;

      const url = new URL(link.href, window.location.href);
      // Off-site: beforeunload owns that case, and it is the only mechanism a
      // page has once the destination is another origin.
      if (url.origin !== window.location.origin) return;
      // Same page — a fragment or a re-click. Nothing is lost.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      // Only the first dirty guard answers, so two forms on one page cannot
      // stack two dialogs on a single click.
      if (dirtyGuard() !== self) return;

      /*
        preventDefault only, deliberately NOT stopPropagation.

        Next's `<Link>` runs the element's own onClick and only then bails out
        if the event is already default-prevented, so cancelling here in the
        capture phase is enough to stop the navigation. Swallowing the event
        outright would also stop the mobile drawer's own close-on-navigate
        handler, leaving the drawer standing open over a dialog asking about the
        form underneath it.
      */
      event.preventDefault();
      self.ask(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);

    return () => {
      GUARDS.delete(self);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty, router]);

  const stay = useCallback(() => {
    proceedRef.current = null;
    setAsking(false);
  }, []);

  const leave = useCallback(() => {
    const proceed = proceedRef.current;
    proceedRef.current = null;
    setAsking(false);
    proceed?.();
  }, []);

  // Escape and a tap on the backdrop both mean Stay. Every accidental dismissal
  // should land on the side that keeps the typing.
  useEffect(() => {
    if (!asking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") stay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asking, stay]);

  const dialog = asking ? (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-guard-title"
      onClick={stay}
      /* Above the mobile drawer (z-50), below the toasts. pointer-events-auto
         because a Radix sheet mid-close still has the body set to none, and a
         dialog nobody can tap is worse than no dialog at all. */
      className="pointer-events-auto fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 sm:items-center"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border bg-background p-4 shadow-lg"
      >
        <h2 id="unsaved-guard-title" className="font-display font-semibold">
          {t("Discard unsaved changes?")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Nothing you have typed on this form has been saved yet.")}
        </p>
        {/* 44px each and 12px apart: this is decided one-handed, holding a box. */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={leave}
            className="focus-ring h-11 flex-1 rounded-md border text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            {t("Leave")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={stay}
            className="focus-ring h-11 flex-1 rounded-md bg-brand text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            {t("Stay")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span ref={anchorRef} hidden aria-hidden="true" />
      {/* Portalled to the body: `fixed` is measured against a transformed
          ancestor rather than the viewport, and a form section that animates
          would otherwise park this dialog somewhere off screen. */}
      {dialog && typeof document !== "undefined"
        ? createPortal(dialog, document.body)
        : null}
    </>
  );
}
