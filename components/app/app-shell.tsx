"use client";

import { Suspense } from "react";
import Link from "next/link";

import { DeveloperBanner } from "@/components/app/developer-banner";
import { DualClock } from "@/components/app/dual-clock";
import { GlassSidebar, type ShellUser } from "@/components/app/glass-sidebar";
import { SIDEBAR_COOKIE, SIDEBAR_ROOM } from "@/lib/sidebar";
import { LocaleProvider, useLocale } from "@/components/app/locale-provider";
import { MobileBack } from "@/components/app/mobile-back";
import { NavTrail } from "@/components/app/nav-trail";
import { MobileTabbar } from "@/components/app/mobile-tabbar";
import { NewVersionNotice } from "@/components/app/new-version-notice";
import { BUILD_ID } from "@/lib/build-id";
import { NotificationBell } from "@/components/app/notification-bell";
import { useState } from "react";
import { Globe, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppShell({
  sections,
  user,
  unreadNotifications = 0,
  developerMode = null,
  sidebarCollapsed = false,
  children,
}: {
  sections: NavSection[];
  user: ShellUser;
  /**
   * Set only while a Developer is looking as somebody else. Passed in rather
   * than read off `user.role`: looking as Hawa makes the role Hawa's, and the
   * bar that says who is REALLY here (and carries Stop) must not disappear at
   * the one moment it matters most. The Developer on their own desk gets no
   * bar — their console says what it is.
   */
  developerMode?: {
    workingAs: { name: string; roleLabel: string } | null;
  } | null;
  /** Drives the count on the bell, and the dot on your own name. */
  unreadNotifications?: number;
  /** The desktop sidebar folded to its rail, as this person last left it. */
  sidebarCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  // Today on the desk's own calendar: Guangzhou for the China warehouse,
  // Dar es Salaam for everyone else.
  const dateFormat = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(user.locale === "zh" ? "zh-CN" : "en-GB", {
      ...options,
      timeZone: user.role === "CHINA_WAREHOUSE" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam",
    }).format(new Date());
  const dateLong = dateFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateShort = dateFormat({ weekday: "short", day: "numeric", month: "short" });
  const fold = (next: boolean) => {
    setCollapsed(next);
    // A cookie, not localStorage: the server reads it, so a folded sidebar is
    // folded on the first paint instead of opening and snapping shut.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "rail" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    // Publishes the reader's language to every client component below. Server
    // components resolve it themselves; a client component has no session to
    // read it from, so the shell hands it down once per request.
    <LocaleProvider locale={user.locale}>
      {/*
      Records where the reader has been, so every back control in the app knows
      the workflow rather than the record's relationships. Mounted once, here,
      because wiring it into each of the ~180 links into detail pages would
      leave whichever one was missed still teleporting people to a batch.
      See lib/nav-trail.ts.
    */}
      <Suspense fallback={null}>
        <NavTrail />
      </Suspense>

      {/* Offered, never forced: a clerk half-way through a consignment must not
        have the form pulled out from under them. See the component. */}
      <NewVersionNotice build={BUILD_ID} />
      {/*
      `print:min-h-0` is a label saved, not a detail.

      On screen this floor is always at least a full viewport tall. On paper
      100vh IS one page — and the browser then puts its own margins inside that
      page, so a box asking for the whole height no longer fits in what is left
      and spills onto a second sheet. Every label Guangzhou printed came out
      "1 / 2" with the second page blank, which on a 4x6 thermal roll is a
      wasted sticker every single time, not a wasted corner of A4.
    */}
      <div className="min-h-screen bg-muted/30 print:min-h-0">
        {developerMode?.workingAs ? (
          <DeveloperBanner workingAs={developerMode.workingAs} />
        ) : null}
        {/* Desktop sidebar: floating glass that folds to a rail. */}
        <GlassSidebar
          mode="desktop"
          sections={sections}
          user={user}
          unread={unreadNotifications}
          collapsed={collapsed}
          onCollapsedChange={fold}
        />

        <div
          className="transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--sidebar-room)] print:pl-0"
          style={
            {
              "--sidebar-room": collapsed ? SIDEBAR_ROOM.rail : SIDEBAR_ROOM.open,
            } as React.CSSProperties
          }
        >
          {/*
          THE TOP BAR, as on Super Drive (owner, 8 Nov 2026): one floating
          rounded bar on every screen, the date on the left and the bell on the
          right, and the page fading out under it as it scrolls.

          Hidden on paper. A print page is about 794px wide — narrower than the
          lg breakpoint — so a browser printing this would render the phone
          chrome; on a 100x70mm label page that pushes the label off its own
          sticker.
        */}
          <div
            className="pointer-events-none sticky top-0 z-20 pb-3 pt-3 print:hidden"
            style={{
              // The shell's own ground (muted at 30% over the page colour),
              // painted solid at the top and fading out under the bar.
              background:
                "linear-gradient(to bottom, hsl(var(--muted) / 0.3) 60%, transparent), linear-gradient(to bottom, hsl(var(--background)) 60%, transparent)",
            }}
          >
            <div
              className={cn(
                "mx-auto px-4 sm:px-6 lg:px-8",
                user.role === "DEVELOPER" ? "max-w-none" : "max-w-[1400px]",
              )}
            >
              <header className="pointer-events-auto flex h-14 items-center justify-between gap-2 rounded-2xl border bg-card/90 pl-1 pr-1.5 shadow-sm backdrop-blur sm:px-3">
                <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                  <div className="lg:hidden">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    {/* 44x44, not 36x36. This is the control every warehouse phone
                      presses first, and 36 is below the size a thumb hits reliably
                      while the other hand is holding a box. */}
                    <Button variant="ghost" size="icon" className="h-11 w-11">
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">
                        {t(user.locale, "Open navigation")}
                      </span>
                    </Button>
                  </SheetTrigger>
                  {/*
                  A column, the same way the desktop sidebar is one.

                  This was three blocks stacked in a plain div: a header, the whole
                  nav at its natural height, and the user panel after it. With eight
                  groups in an admin menu that is taller than a phone, so the nav ran
                  off the bottom of the sheet and took Sign out with it — visible on
                  no portal, on any phone, and worst on the roles with the most rows.

                  `100dvh`, not `h-full`. A mobile browser's layout viewport includes
                  the strip behind its own collapsing address bar and toolbar, so a
                  sheet sized to it puts its last 60-odd pixels underneath the
                  browser chrome. The dynamic unit tracks what is actually on screen.
                */}
                  <SheetContent
                    side="left"
                    // The drawer is only a frame: the glass pane inside it is the
                    // sidebar, with its own round button to close it.
                    className="flex h-[100dvh] w-[19.5rem] max-w-[calc(85vw+0.75rem)] flex-col gap-0 border-0 bg-transparent py-3 pl-3 pr-0 shadow-none [&>button]:hidden"
                  >
                    <SheetTitle className="sr-only">
                      {t(user.locale, "Navigation")}
                    </SheetTitle>
                    <GlassSidebar
                      mode="sheet"
                      sections={sections}
                      user={user}
                      unread={unreadNotifications}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                  </div>
                  {/*
                  THE WAY BACK, on a phone and a tablet.

                  The Guangzhou desk opens this inside WeChat's browser, which
                  has no back button — an ✕ that closes everything and nothing
                  else. So the app carries its own way back, where a thumb
                  already is. On a desk's own home there is nowhere to go back
                  to, and the phone shows the date there instead.
                */}
                  <div className="min-w-0 lg:hidden">
                    <MobileBack
                      fallback={
                        <span className="block truncate pl-1 text-sm font-medium text-foreground/80 sm:hidden" suppressHydrationWarning>
                          {dateShort}
                        </span>
                      }
                    />
                  </div>
                  <p
                    className="hidden min-w-0 truncate text-sm font-medium text-foreground/80 sm:block lg:pl-1"
                    suppressHydrationWarning
                  >
                    {dateLong}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  {/* Both cities, because cargo on every desk starts in
                      Guangzhou; the desk you are standing in first. */}
                  <DualClock
                    inline
                    emphasis={user.role === "CHINA_WAREHOUSE" ? "CN" : "TZ"}
                    className="mr-2 hidden text-xs text-muted-foreground xl:block"
                  />
                  <MainSiteLink compact className="hidden sm:inline-flex" />
                  <NotificationBell unread={unreadNotifications} />
                </div>
              </header>
            </div>
          </div>
          {/*
          The reading container, and nothing to do with paper.

          Its max-width and padding are for a screen. Left on for print they
          eat ~13mm of an A4 page, which is enough to stop a second 100mm label
          fitting on a row — so a sheet of eight silently prints as a column of
          four with half the adhesive stock blank. The page decides its own
          margins through @page; this must get out of the way.
        */}
          {/* The Developer's pages fill the screen, like the other projects'
            consoles: charts and tables are the point there, and a centred
            column leaves a dead band down both sides of a wide monitor. Every
            other account — and the Developer while working AS another account,
            whose role is then theirs — keeps the readable column. */}
          <div
            className={cn(
              "mx-auto px-4 pb-4 pt-1 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 print:max-w-none print:p-0",
              user.role === "DEVELOPER" ? "max-w-none" : "max-w-[1400px]",
            )}
          >
            {children}
            {/* Working as someone: the pill floats at the bottom, where the
                owner wants it, and this much room is left under the page so
                it never sits on the last button or figure. */}
            {developerMode?.workingAs ? (
              <div aria-hidden className="h-14 print:hidden" />
            ) : null}
          </div>
          {/*
          The room the bottom bar stands in.

          A spacer element rather than bottom padding on the container above it:
          that container's padding is already set three times over (`p-4 sm:p-6
          lg:p-8 print:p-0`), and a responsive variant beats an unprefixed
          `pb-*` in the cascade, so the padding would have silently vanished
          from every phone wider than the sm breakpoint — the large-screen
          phones, which is most of them.

          Without this the bar is not chrome, it is a lid: the last row of every
          list — the oldest overdue invoice, the last box on a manifest — sits
          under it, and on a list that ends exactly at the fold there is nothing
          to scroll to reveal it. Height matches the bar exactly: 3.5rem of tabs
          plus whatever the phone's home indicator claims.
        */}
          <div
            aria-hidden
            className="h-[calc(3.5rem_+_env(safe-area-inset-bottom))] lg:hidden print:hidden"
          />
        </div>

        {/*
        The four screens this desk lives in, plus the way into everything else.

        Mounted here rather than inside the content column because it is
        `position: fixed` — it belongs to the shell, not to the page scrolling
        underneath it. `onMore` opens the Sheet declared above: one drawer,
        two handles.
      */}
        <MobileTabbar
          sections={sections}
          role={user.role}
          onMore={() => setMobileOpen(true)}
        />
      </div>
    </LocaleProvider>
  );
}

/**
 * The way back to the public site, from any desk.
 *
 * There was none. Once you were inside the portal the only door out of it was
 * Sign out, so staff who wanted to look at the customer-facing site — to check
 * a price page, or read what a customer is reading on the tracking screen —
 * signed out and signed back in to get there and back.
 *
 * An ordinary in-tab link, deliberately. A new tab would leave two Target
 * Express windows open on a warehouse phone and the person guessing which one
 * still has their work in it. Going to the main site does not touch the
 * session: it is the same origin, the cookie stays, and coming back lands on
 * the department they left.
 */
function MainSiteLink({ compact = false, className }: { compact?: boolean; className?: string }) {
  const locale = useLocale();
  return (
    <Button
      asChild
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        compact ? "h-11 w-11" : "gap-2 px-2.5",
        className,
      )}
    >
      <Link href="/" title="Open the public website — you stay signed in">
        <Globe className="h-4 w-4" />
        {compact ? (
          <span className="sr-only">{t(locale, "Main site")}</span>
        ) : (
          t(locale, "Main site")
        )}
      </Link>
    </Button>
  );
}
