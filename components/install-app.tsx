"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, Download, EllipsisVertical, Menu, Share, SquarePlus, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Use it as an app (owner, 9 Nov 2026: the screen should be full, like an app,
 * on every phone). A website in a browser tab always keeps the browser's own
 * bars and no page can hide them; the only full-screen version is the one put
 * on the home screen. So a phone that has not done that gets a small sheet
 * saying how — one tap on Android, three steps on an iPhone. It opens by itself
 * after sign-in on every visit until the app is installed (owner: push people to
 * install it), and any time from the sign-in page. Nothing shows once the app is
 * installed. Copied from Super Drive. Kept small (owner, 9 Nov 2026, holding up
 * the iPhone's: "it should be small and nice, don't make it big").
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Chrome on Android fires this once, early; kept here so any part of the page can use it later.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

/* "Got it" is remembered for this visit only, so the next visit asks again until the app is installed. */
const ASKED = "tx.installAsked";

/**
 * Which phone browser this is, because the way to the home screen differs:
 * Safari's Share sheet, Chrome's ⋮ menu, Samsung Internet's and Huawei's ☰
 * menu at the bottom, and WeChat or WhatsApp, whose own browser cannot add
 * anything to the home screen at all (Guangzhou opens links in WeChat).
 */
type Browser = "safari" | "ios-other" | "chrome" | "samsung" | "huawei" | "android-other" | "in-app";

function browserOf(ua: string, ios: boolean): Browser {
  if (/MicroMessenger|WhatsApp|FBAN|FBAV|Instagram|Line\//i.test(ua)) return "in-app";
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "safari";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/HuaweiBrowser|HBPC|HarmonyOS|OpenHarmony|ArkWeb/i.test(ua)) return "huawei";
  if (/Chrome\//i.test(ua) && !/EdgA|OPR|Firefox|YaBrowser|UCBrowser|MiuiBrowser|HeyTapBrowser/i.test(ua)) return "chrome";
  return "android-other";
}

function useInstall() {
  const [state, setState] = useState({ ready: false, phone: false, installed: false, ios: false, browser: "chrome" as Browser, canPrompt: false });
  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const phone = window.matchMedia("(max-width: 1023px)").matches && window.matchMedia("(pointer: coarse)").matches;
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState({ ready: true, phone, installed: standalone, ios, browser: browserOf(navigator.userAgent, ios), canPrompt: !!deferred });
    };
    check();
    listeners.add(check);
    return () => void listeners.delete(check);
  }, []);
  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    listeners.forEach((f) => f());
    return outcome === "accepted";
  }, []);
  return { ...state, install };
}

/** One step: a plain line — a small red number, the words, the button it names drawn faint at the end. No box, no disc
    (owner, 9 Nov 2026, holding up the ZELab card: "clean, small, and match the background"). */
function Step({ n, icon: Icon, children }: { n: number; icon?: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5 text-[13px] leading-snug text-white/75">
      <span className="w-2.5 shrink-0 text-center font-mono text-[11px] text-[#e74049]">{n}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {Icon ? <Icon className="size-3.5 shrink-0 text-white/30" /> : null}
    </li>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { ios, browser, canPrompt, install } = useInstall();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // On an iPhone in Safari a small arrow points at the Share button.
  const hint = ios && browser === "safari" && !canPrompt;

  /* Frosted glass that belongs to the page: it sits low, clear of the sign-in page's two foot lines and the app's
     bottom tabs (both about 4 rem tall), and leaves
     the logo and Sign in alone; the dim behind it is barely there, and the card is see-through night navy, blurring
     what is under it instead of covering it. Only a title and the steps. Closing is the X, a tap outside, or Escape.
     Always dark, so it reads the same over the night scene and over the app in day mode. */
  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/15 p-5",
        hint
          ? "pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+7rem)]"
          : "pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+4.5rem)]",
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Use it like an app")}
        className="w-full max-w-[17.5rem] rounded-2xl border border-white/[0.09] bg-[#070b16]/60 px-4 pb-1.5 pt-3.5 shadow-[0_18px_44px_-22px_rgba(0,0,0,0.75)] backdrop-blur-2xl backdrop-saturate-150"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-medium tracking-tight text-white">{t("Use it like an app")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {canPrompt ? (
          <div className="mb-1.5 mt-3 flex flex-col items-stretch">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/10 text-[13px] font-medium text-white ring-1 ring-inset ring-white/15 transition hover:bg-white/15"
              onClick={async () => { if (await install()) onClose(); }}
            >
              <Download className="size-3.5" />
              {t("Install the app")}
            </button>
            <button type="button" className="h-8 text-[12px] text-white/45 transition hover:text-white/75" onClick={onClose}>
              {t("Not now")}
            </button>
          </div>
        ) : (
          <ol className="mt-1.5 divide-y divide-white/[0.06]">
            {browser === "in-app" ? (
              <>
                <Step n={1} icon={EllipsisVertical}>{t("Tap ··· at the top right, then Open in browser.")}</Step>
                <Step n={2}>{ios ? t("In Safari, sign in and tap Get the full-screen app again.") : t("In the browser, sign in and tap Get the full-screen app again.")}</Step>
              </>
            ) : ios ? (
              <>
                <Step n={1} icon={Share}>
                  {browser === "safari" ? t("Tap Share (bottom bar, or ···).") : t("Tap Share in the address bar or the menu.")}
                </Step>
                <Step n={2} icon={SquarePlus}>{t("Tap Add to Home Screen.")}</Step>
                <Step n={3}>{t("Tap Add, then open Target Express.")}</Step>
              </>
            ) : browser === "samsung" ? (
              <>
                <Step n={1} icon={Menu}>{t("Tap the menu at the bottom right.")}</Step>
                <Step n={2}>{t("Tap Add page to, then Home screen.")}</Step>
                <Step n={3}>{t("Open Target Express from your home screen.")}</Step>
              </>
            ) : browser === "huawei" ? (
              <>
                <Step n={1} icon={Menu}>{t("Tap the menu at the bottom of the browser.")}</Step>
                <Step n={2}>{t("Tap Add to home screen (it may be under Add to).")}</Step>
                <Step n={3}>{t("Open Target Express from your home screen.")}</Step>
              </>
            ) : (
              <>
                <Step n={1} icon={browser === "chrome" ? EllipsisVertical : Menu}>
                  {browser === "chrome" ? t("Open the browser menu at the top right.") : t("Open the browser menu.")}
                </Step>
                <Step n={2}>{t("Tap Install app or Add to Home screen.")}</Step>
                <Step n={3}>{t("Open Target Express from your home screen.")}</Step>
              </>
            )}
          </ol>
        )}
      </div>

      {/* No iPhone can install in one tap, so the next best thing: while the card is open in Safari, a small arrow
          bounces over the toolbar where Share actually is, so nobody hunts for it. */}
      {hint ? (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+3.5rem)] z-[60] flex justify-center">
          <span className="flex animate-bounce flex-col items-center gap-0.5 text-[10px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] motion-reduce:animate-none">
            {t("Share")}
            <ArrowDown className="size-3.5 text-[#e74049]" />
          </span>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** Opens by itself a moment after a phone's browser opens the app, on every visit until it is installed; "Got it" holds for this visit. */
export function InstallPrompt() {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !phone || installed) return;
    try {
      if (window.sessionStorage.getItem(ASKED)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ready, phone, installed]);
  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(ASKED, "1");
    } catch {
      /* private window: it simply asks again next time */
    }
  };
  return <InstallSheet open={open} onClose={close} />;
}

/** A button that opens the sheet. Draws nothing on a computer or once the app is installed. */
export function InstallButton({ render }: { render: (open: () => void) => React.ReactNode }) {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  if (!ready || !phone || installed) return null;
  return (
    <>
      {render(() => setOpen(true))}
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
