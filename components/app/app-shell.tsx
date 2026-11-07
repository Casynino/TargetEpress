"use client";

import { Suspense } from "react";
import Link from "next/link";

import { DeveloperBanner } from "@/components/app/developer-banner";
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

import { ThemeToggle } from "@/components/theme-toggle";
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

        {/* Mobile top bar */}
        {/*
        Hidden on paper as well as on a desktop.

        `lg:hidden` reads as "phones only", but a print page is about 794px
        wide — narrower than the lg breakpoint — so a browser printing this
        renders the phone chrome. On A4 that was a hamburger and a logo at the
        top of the sheet; on a 100x70mm label page it is 3.7mm of a 70mm page,
        which pushes the label off its own sticker.
      */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 lg:hidden print:hidden">
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

          {/*
          THE WAY BACK, and it takes the middle of the bar when there is one.

          The Guangzhou desk opens this inside WeChat's browser, which has no
          back button — an ✕ that closes everything and nothing else. A colleague
          who opened Receive cargo and wanted another screen had no route except
          signing out and signing back in. So the app carries its own way back,
          and it sits where a thumb already is.

          The logo keeps its place when there is nowhere to go back to, because
          on a portal root the brand IS the right thing in the middle.
        */}
          <div className="flex min-w-0 flex-1 items-center justify-center px-1">
            <MobileBack />
          </div>

          <div className="flex items-center gap-1">
            <MainSiteLink compact />
            <NotificationBell unread={unreadNotifications} />
            <ThemeToggle className="h-11 w-11" />
          </div>
        </div>

        <div
          className="transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--sidebar-room)] print:pl-0"
          style={
            {
              "--sidebar-room": collapsed ? SIDEBAR_ROOM.rail : SIDEBAR_ROOM.open,
            } as React.CSSProperties
          }
        >
          {/* A thin bar for the bell and the way out to the public site. Nothing
            else belongs up here — anything more would compete with the page's
            own heading. */}
          <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-1 border-b bg-background/80 px-8 backdrop-blur lg:flex">
            <MainSiteLink />
            <NotificationBell unread={unreadNotifications} />
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
              "mx-auto p-4 sm:p-6 lg:p-8 print:max-w-none print:p-0",
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
function MainSiteLink({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  return (
    <Button
      asChild
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        compact ? "h-11 w-11" : "gap-2 px-2.5",
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
