import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Lock, Plane, ShieldCheck } from "lucide-react";
import type { Metadata, Viewport } from "next";

import { LocaleProvider } from "@/components/app/locale-provider";
import { BrandLockup, BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { LoginGate } from "@/components/login-gate";
import { LoginSky } from "@/components/login-sky";
import { COMPANY } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

// The scene is always night, so the phone's own bar is too.
export const viewport: Viewport = { themeColor: "#05070f" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return {
    title: t(locale, "Staff sign in"),
    robots: { index: false, follow: false },
  };
}

/**
 * The first thing the company says to its own staff.
 *
 * It was a form on a white half and a flat blue half — correct, and it looked
 * like the login of something bought rather than built. This is the same form
 * over the corridor the business actually runs: Guangzhou, Hong Kong and Dubai
 * into Dar es Salaam, drawn from the real route list rather than invented
 * cities, because the first screen should not open with a decoration that is
 * not true.
 *
 * Dark on purpose, and always dark regardless of the theme toggle: this page
 * sits outside the app shell and is read at six in the morning on a warehouse
 * floor and at midnight from a phone. The backdrop is one server component with
 * no JavaScript at all — see LoginSky — so nothing here delays the form a
 * person is trying to type into.
 *
 * On a phone the scene is the page (owner, 9 Nov 2026, as on Super Drive): the
 * logo, two lines and one Sign in button, and the card opens as a pop-up over
 * the routes instead of covering them. `dark` on the wrapper pins the form's
 * own tokens to night too, so a person who chose day inside the app does not
 * get white fields on the night sky.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string; dev?: string }>;
}) {
  const { callbackUrl, revoked, dev } = await searchParams;
  const locale = await viewerLocale();

  return (
    <div data-login-scene className="dark relative isolate min-h-dvh overflow-hidden bg-[#05070f] text-white">
      <LoginSky />

      <LocaleProvider locale={locale}>
      <div className="relative flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
        <header className="flex items-center justify-between gap-4 p-4 sm:p-6 sm:px-10">
          <Link href="/" className="focus-ring rounded-lg max-md:hidden">
            <BrandLockup />
          </Link>
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white md:px-3.5 md:py-1.5 md:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            {t(locale, "Back to site")}
          </Link>
        </header>

        {/* svh, not vh: on a phone vh is the screen with the browser's bars
            hidden, so vh spacing pushed the words down onto the routes. */}
        <main className="flex flex-1 px-6 pb-24 pt-[3svh] sm:px-10 md:items-center md:py-10">
          <div className="mx-auto grid grid-cols-1 w-full max-w-6xl items-start gap-12 md:items-center lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            {/* The claim, on the side the routes are flying through. Hidden on
                a phone: the form is why anybody opened this page, and it should
                not start below the fold. */}
            <div className="hidden lg:block">
              {/* No pill. A border and a tinted fill around three place names
                  is chrome doing the work that letter-spacing and a brighter
                  ink already do — and on a dark page it reads as a button
                  nobody can press. */}
              <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                <Plane className="h-3.5 w-3.5 text-signal" />
                {t(locale, "Guangzhou · Hong Kong · Dubai — Dar es Salaam")}
              </span>

              <h1 className="mt-6 font-display text-[42px] font-bold leading-none tracking-tight">
                {t(locale, "Welcome on board")}
              </h1>

              {/* Three lines to the person signing in, not to a customer. The
                  claim about kilos belongs on the public site; this is the
                  screen a clerk opens at six in the morning. */}
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
                {t(locale, "Every shipment has a journey.")}
                <br />
                {t(locale, "Every detail matters.")}
                <br />
                {t(locale, "Every action keeps our customers moving forward.")}
              </p>

              <p className="mt-6 font-display text-lg font-bold tracking-tight text-white/90">
                Target Express Air Cargo
              </p>
              {/* The company's own words, in the company's own language. */}
              <p className="mt-1 font-display text-xl font-bold tracking-[0.08em] text-signal">
                KWETU MUDA NI MALI
              </p>

              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
                {[
                  {
                    k: COMPANY.promiseDays + " " + t(locale, "days"),
                    v: t(locale, "door to door"),
                  },
                  { k: "2", v: t(locale, "warehouses, one record") },
                  { k: "1", v: t(locale, "QR code per box") },
                ].map((stat) => (
                  <div key={stat.v}>
                    <dt className="font-display text-2xl font-bold tabular-nums">
                      {stat.k}
                    </dt>
                    <dd className="mt-0.5 text-xs uppercase tracking-[0.14em] text-white/45">
                      {stat.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* The card. Glass over the routes rather than a panel beside
                them, so the backdrop is something it sits in, not next to. */}
            <div className="relative flex w-full flex-col items-center text-center md:block md:text-left">
              {/* The phone's page: the mark, who it is for, and the button. */}
              <div className="flex flex-col items-center md:hidden">
                <BrandMark className="login-up h-20 w-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
                <p className="login-up mt-3 font-display text-[34px] font-extrabold leading-none tracking-tight text-signal" style={{ "--rd": "0.08s" } as React.CSSProperties}>
                  Target
                </p>
                <p className="login-up mt-1.5 text-[13px] font-bold uppercase tracking-[0.22em] text-brand" style={{ "--rd": "0.12s" } as React.CSSProperties}>
                  Express Air Cargo
                </p>
                <p className="login-up mt-[10svh] font-display text-[22px] font-semibold tracking-tight" style={{ "--rd": "0.25s" } as React.CSSProperties}>
                  {t(locale, "Welcome on board")}
                </p>
                <p className="login-up mb-6 mt-1.5 max-w-[17rem] text-balance text-sm text-white/65" style={{ "--rd": "0.32s" } as React.CSSProperties}>
                  {t(locale, "Every shipment has a journey.")}
                </p>
              </div>

              <LoginGate startOpen={revoked === "1"}>
              <div className="relative w-full max-md:max-w-sm max-md:text-left md:mx-0">
              <div
                aria-hidden
                className="absolute -inset-px rounded-3xl bg-gradient-to-b from-white/25 via-white/5 to-transparent"
              />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-7 max-md:bg-[#0c1222]/90 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                  <Lock className="h-3 w-3" />
                  {t(locale, "Staff access only")}
                </span>

                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
                  {t(locale, "Sign in")}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {t(
                    locale,
                    "Your dashboard opens automatically based on your department."
                  )}
                </p>

                {/* Sent here by the app itself, because the account behind
                    their session was suspended or its role changed while they
                    were working. Saying so is the difference between "sign in
                    again" and "the system is broken". */}
                {revoked === "1" ? (
                  <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
                    {dev === "1"
                      ? t(
                          locale,
                          "Developer sessions end after 8 hours. Please sign in again."
                        )
                      : t(
                          locale,
                          "Your access has changed since you signed in. Please sign in again."
                        )}
                  </p>
                ) : null}

                <div className="mt-7">
                  <LoginForm callbackUrl={callbackUrl} />
                </div>

                <p className="mt-6 flex items-start gap-2 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/45">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
                  {t(
                    locale,
                    "Lost your password? Ask the CEO to reset it — accounts are managed internally, and nobody else can issue one."
                  )}
                </p>
              </div>
              </div>
              </LoginGate>
            </div>
          </div>
        </main>

        {/* A phone keeps two quiet lines at the foot of the scene. */}
        <div className="fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col items-center md:hidden">
          <p className="text-center text-[11px] tracking-wide text-white/45">
            {COMPANY.name} · <span className="font-semibold text-signal/80">KWETU MUDA NI MALI</span>
          </p>
          <DevelopedBy label={t(locale, "Developed by")} />
        </div>

        <footer className="hidden flex-wrap items-end justify-between gap-x-10 gap-y-4 p-6 text-xs leading-relaxed text-white/35 sm:px-10 md:flex">
          <div className="flex flex-wrap items-center gap-x-5">
            <p className="font-medium text-white/60">{COMPANY.name}</p>
            <DevelopedBy label={t(locale, "Developed by")} />
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <p>🇨🇳 {COMPANY.chinaAddress}</p>
            <p>🇹🇿 {COMPANY.darAddress}</p>
          </div>
        </footer>
      </div>
      </LocaleProvider>
    </div>
  );
}

/**
 * Who built the system — one quiet line to Nino's page and work, as on the Vegas site. Plain words, no pill or
 * badge around them (owner, 9 Nov 2026: "clean like before").
 */
function DevelopedBy({ label }: { label: string }) {
  return (
    <Link
      href="/nino"
      className="focus-ring group inline-flex min-h-9 items-center gap-1 rounded text-xs text-white/45 transition-colors hover:text-white"
    >
      {label}{" "}
      <span className="font-semibold text-white/75 transition-colors group-hover:text-[#e74049]">Nino</span>
      <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </Link>
  );
}
