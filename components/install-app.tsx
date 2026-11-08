"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, EllipsisVertical, Menu, Share, Smartphone, SquarePlus } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Use it as an app (owner, 9 Nov 2026: the screen should be full, like an app,
 * on every phone). A website in a browser tab always keeps the browser's own
 * bars and no page can hide them; the only full-screen version is the one put
 * on the home screen. So a phone that has not done that gets a small sheet
 * saying how — one tap on Android, three steps on an iPhone. It opens by itself
 * once after sign-in, and any time from the sign-in page. Nothing shows once
 * the app is installed. Copied from Super Drive.
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

const SEEN = "tx.installSeen";

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

function Step({ n, icon: Icon, children }: { n: number; icon?: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] leading-snug">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </li>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { ios, browser, canPrompt, install } = useInstall();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-2xl p-5">
        <div className="flex items-center gap-3 pr-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0b1a33] text-white">
            <Smartphone className="size-5" />
          </span>
          <div>
            <DialogTitle className="text-base font-semibold">{t("Use it like an app")}</DialogTitle>
            <DialogDescription className="text-[13px]">{t("Full screen, no browser bar, its own icon.")}</DialogDescription>
          </div>
        </div>

        {canPrompt ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="brand" onClick={async () => { if (await install()) onClose(); }}>
              <Download className="mr-2 size-4" />
              {t("Install the app")}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t("Not now")}
            </Button>
          </div>
        ) : (
          <>
            <ol className="mt-4 space-y-2">
              {browser === "in-app" ? (
                <>
                  <Step n={1} icon={EllipsisVertical}>{t("Tap ··· at the top right, then Open in browser.")}</Step>
                  <Step n={2}>{ios ? t("In Safari, sign in and tap Get the full-screen app again.") : t("In the browser, sign in and tap Get the full-screen app again.")}</Step>
                </>
              ) : ios ? (
                <>
                  <Step n={1} icon={Share}>
                    {browser === "safari" ? t("Tap Share at the bottom of Safari.") : t("Tap Share in the address bar or the menu.")}
                  </Step>
                  <Step n={2} icon={SquarePlus}>{t("Scroll down and tap Add to Home Screen.")}</Step>
                  <Step n={3}>{t("Tap Add, then open Target Express from your home screen.")}</Step>
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
            {browser !== "in-app" ? (
              <p className="mt-3 text-[12px] text-muted-foreground">
                {ios
                  ? t("If this page opened inside WeChat or WhatsApp, open it in Safari first.")
                  : t("If this page opened inside WeChat or WhatsApp, open it in Chrome first.")}
              </p>
            ) : null}
            <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
              {t("Got it")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Opens by itself once, a moment after a phone's browser opens the app (never when it is installed); closing it is remembered. */
export function InstallPrompt() {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !phone || installed) return;
    try {
      if (window.localStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ready, phone, installed]);
  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN, "1");
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
