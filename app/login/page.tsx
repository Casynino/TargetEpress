import Link from "next/link";
import { ArrowLeft, Lock, Plane, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { BrandLockup } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { LoginSky } from "@/components/login-sky";
import { COMPANY } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

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
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string }>;
}) {
  const { callbackUrl, revoked } = await searchParams;
  const locale = await viewerLocale();

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#05070f] text-white">
      <LoginSky />

      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 p-6 sm:px-10">
          <Link href="/" className="focus-ring rounded-lg">
            <BrandLockup />
          </Link>
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t(locale, "Back to site")}
          </Link>
        </header>

        <main className="flex flex-1 items-center px-6 py-10 sm:px-10">
          <div className="mx-auto grid grid-cols-1 w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
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
            <div className="relative w-full">
              <div
                aria-hidden
                className="absolute -inset-px rounded-3xl bg-gradient-to-b from-white/25 via-white/5 to-transparent"
              />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
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
                    {t(
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
          </div>
        </main>

        <footer className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 p-6 text-xs leading-relaxed text-white/35 sm:px-10">
          <p className="font-medium text-white/60">{COMPANY.name}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <p>🇨🇳 {COMPANY.chinaAddress}</p>
            <p>🇹🇿 {COMPANY.darAddress}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
