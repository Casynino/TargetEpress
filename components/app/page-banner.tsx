import Image from "next/image";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Bell } from "lucide-react";

import { BannerTheme } from "@/components/app/banner-theme";
import { ROLE_LABELS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

/* The aircraft the public site opens on — the brand's own picture, already
   allowed in next.config. It stands where Super Drive shows its products. */
const PHOTO =
  "https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=900&q=70";

/**
 * The job title under the name. The owner is the CEO and the manager the
 * Director (owner, 8 Nov 2026); every other desk is its department.
 */
function jobTitle(role: Role) {
  if (role === "ADMIN") return "CEO";
  if (role === "MANAGER") return "Director";
  return ROLE_LABELS[role];
}

/** Today, written out, on the desk's own calendar. */
function bannerDate(locale: Locale, zone: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  }).format(new Date());
}

/**
 * THE SMALL BANNER every desk opens on (owner, 8 Nov 2026).
 *
 * Copied from Super Drive's point-of-sale banner: deep navy, a blue glow on
 * the right and a little gold light from the top. The person's name stands in
 * wide capitals between two gold rules, their job title small in gold under
 * it, then the date. The bell and the night / day switch sit at the left and
 * the aircraft at the right on a wide screen. Each desk's search box and
 * first button sit just under it.
 *
 * Everything is read here from whoever is signed in, so no desk can show a
 * name and a title that disagree. While the Developer works as someone, it is
 * that person's banner, as every other screen is theirs. The name comes from
 * the record, not the session token, which keeps whatever it was at sign-in.
 */
export async function PageBanner() {
  const [user, locale] = await Promise.all([requireUser(), viewerLocale()]);
  const [me, unread] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const name = (me?.name ?? user.name).trim().split(/\s+/)[0] || user.name;
  // The China warehouse is five hours ahead, and already on tomorrow for part
  // of every night.
  const zone = user.role === "CHINA_WAREHOUSE" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam";
  // A long name gets narrower letters, or a phone would push it onto two lines.
  const long = name.length > 10;

  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#07122a_0%,#0b1f45_45%,#10306a_75%,#17428c_100%)] text-white shadow-[0_12px_30px_-14px_rgba(5,22,39,0.75),inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10 print:hidden">
      {/* Depth, painted in: a blue light from the right, a little gold from
          the top, and a fine sheen along the top edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_220px_at_92%_60%,rgba(64,140,255,0.38),transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_150px_at_50%_-10%,rgba(253,196,0,0.16),transparent_70%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {/* The aircraft at the side: softly on a phone, clearer on a computer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[45%] opacity-35 [mask-image:linear-gradient(to_left,#000_20%,transparent)] sm:w-[34%] sm:opacity-60 lg:w-[30%] lg:opacity-75 lg:[mask-image:linear-gradient(to_left,#000_40%,transparent)]"
      >
        <Image src={PHOTO} alt="" fill sizes="(min-width: 1024px) 30vw, 45vw" className="object-cover" />
      </div>

      {/* The bell and the night / day switch: small icons at the left, in the
          middle, on a computer. A phone has them in its own bar and menu. */}
      <div className="absolute left-6 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2">
        <Link
          href="/app/notifications"
          title={t(locale, "Notifications")}
          className="focus-ring relative hidden size-8 place-items-center rounded-full text-white/65 transition hover:text-white lg:inline-grid"
        >
          <Bell className="size-[15px]" />
          <span className="sr-only">{t(locale, "Notifications")}</span>
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        <BannerTheme />
      </div>

      <div className="relative flex min-h-[5.75rem] flex-col items-center justify-center px-5 py-4 text-center sm:min-h-[7.5rem] sm:py-5">
        <h1
          className={cn(
            "flex max-w-full items-center gap-4 font-semibold uppercase text-white",
            long
              ? "text-base tracking-[0.2em] sm:text-2xl sm:tracking-[0.3em] lg:text-3xl"
              : "text-xl tracking-[0.32em] sm:text-3xl sm:tracking-[0.5em] lg:text-4xl",
          )}
        >
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
          {/* The padding gives back the space the wide tracking leaves after
              the last letter, so the word sits truly in the middle. */}
          <span className={cn("min-w-0 break-words", long ? "pl-[0.2em] sm:pl-[0.3em]" : "pl-[0.32em] sm:pl-[0.5em]")}>
            {name}
          </span>
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
        </h1>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#fdc400] sm:mt-2 sm:text-[11px]">
          {t(locale, jobTitle(user.role))}
        </p>
        <p className="mt-1 text-xs text-white/65 sm:mt-1.5 sm:text-sm">{bannerDate(locale, zone)}</p>
      </div>
    </section>
  );
}
