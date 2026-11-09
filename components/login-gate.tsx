"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Smartphone, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { InstallButton } from "@/components/install-app";
import { cn } from "@/lib/utils";

/**
 * On a phone the sign-in card must not cover the scene (owner, 9 Nov 2026, as
 * on Super Drive): the page shows the logo, the routes and ONE small Sign in
 * button, and pressing it opens the card as a pop-up (Escape, the X or a tap
 * outside closes it). From `md` up the card simply stays on the page as before
 * — `md:contents` makes this wrapper invisible there.
 */
export function LoginGate({ startOpen = false, children }: { startOpen?: boolean; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(startOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-login-open
        onClick={() => setOpen(true)}
        className="login-up focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-brand px-8 text-[15px] font-semibold text-brand-foreground shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] md:hidden"
        style={{ "--rd": "0.45s" } as React.CSSProperties}
      >
        {t("Sign in")}
        <ArrowRight className="size-4" />
      </button>
      {/* A browser tab always keeps its bars; the home-screen app is full
          screen. Only phones that have not installed it see this. */}
      <InstallButton
        render={(openSheet) => (
          <button
            type="button"
            onClick={openSheet}
            className="login-up mt-4 inline-flex items-center gap-1.5 text-[13px] text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline md:hidden"
            style={{ "--rd": "0.6s" } as React.CSSProperties}
          >
            <Smartphone className="size-3.5" />
            {t("Get the full-screen app")}
          </button>
        )}
      />

      <div
        className={cn(
          "md:contents",
          open
            ? "max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:items-start max-md:justify-center max-md:overflow-y-auto max-md:bg-[#02040a]/45 max-md:p-5 max-md:backdrop-blur-[2px] max-md:pt-[max(14vh,calc(env(safe-area-inset-top)+1rem))]"
            : "max-md:hidden",
        )}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      >
        <div className={cn("relative w-full max-md:max-w-[19rem]", open && "login-pop md:animate-none")}>
          {children}
          {open ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("Close")}
              className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 md:hidden"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
