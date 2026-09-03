"use client";

import Link from "next/link";

import { LanguageSwitch } from "@/components/app/language-switch";
import { LocaleProvider, useLocale } from "@/components/app/locale-provider";
import { MobileBack } from "@/components/app/mobile-back";
import { MobileTabbar } from "@/components/app/mobile-tabbar";
import { NewVersionNotice } from "@/components/app/new-version-notice";
import { BUILD_ID } from "@/lib/build-id";
import { NotificationBell } from "@/components/app/notification-bell";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  TrendingUp,
  Scale,
  Receipt,
  BadgeCheck,
  FileText,
  ShieldCheck,
  Landmark,
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  FlaskConical,
  Globe,
  Headset,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  PackagePlus,
  PhoneCall,
  PlaneTakeoff,
  QrCode,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  SlidersHorizontal,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { BrandLockup } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logoutAction } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  TrendingUp,
  Scale,
  Receipt,
  BadgeCheck,
  FileText,
  ShieldCheck,
  Landmark,
  SlidersHorizontal,
  LayoutDashboard,
  ScanLine,
  Package,
  PackagePlus,
  Boxes,
  ClipboardCheck,
  Truck,
  AlertTriangle,
  Wallet,
  ReceiptText,
  Banknote,
  CalendarClock,
  QrCode,
  Users,
  ChartNoAxesCombined,
  UserCog,
  History,
  FlaskConical,
  Globe,
  UserRound,
  Bell,
  Inbox,
  ArrowLeftRight,
  Headset,
  MessageSquare,
  PhoneCall,
  PlaneTakeoff,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  TriangleAlert,
  Warehouse,
};

type ShellUser = {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
  photoUrl?: string | null;
  /** Which language this person reads the system in. */
  locale: Locale;
};

export function AppShell({
  sections,
  user,
  unreadNotifications = 0,
  children,
}: {
  sections: NavSection[];
  user: ShellUser;
  /** Drives the count on the bell, and the dot on your own name. */
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    // Publishes the reader's language to every client component below. Server
    // components resolve it themselves; a client component has no session to
    // read it from, so the shell hands it down once per request.
    <LocaleProvider locale={user.locale}>
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link href="/app/dashboard">
            <BrandLockup />
          </Link>
        </div>
        <NavList
          sections={sections}
          locale={user.locale}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        />
        <UserPanel user={user} unread={unreadNotifications} />
      </aside>

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
              <span className="sr-only">{t(user.locale, "Open navigation")}</span>
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
            className="flex h-[100dvh] w-[280px] max-w-[85vw] flex-col p-0"
          >
            <SheetTitle className="sr-only">{t(user.locale, "Navigation")}</SheetTitle>
            <div className="flex h-16 shrink-0 items-center border-b px-5">
              <BrandLockup />
            </div>
            {/*
              `overscroll-contain` so reaching the end of the menu does not
              start scrolling the page behind the sheet — which on a phone
              reads as the whole app sliding around under your thumb.
            */}
            <NavList
              sections={sections}
              locale={user.locale}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
              onNavigate={() => setMobileOpen(false)}
            />
            <UserPanel user={user} unread={unreadNotifications} />
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

      <div className="lg:pl-64">
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
        <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 print:max-w-none print:p-0">
          {children}
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
        compact ? "h-11 w-11" : "gap-2 px-2.5"
      )}
    >
      <Link href="/" title="Open the public website — you stay signed in">
        <Globe className="h-4 w-4" />
        {compact ? <span className="sr-only">{t(locale, "Main site")}</span> : t(locale, "Main site")}
      </Link>
    </Button>
  );
}

function NavList({
  sections,
  locale,
  className,
  onNavigate,
}: {
  sections: NavSection[];
  /** Nav labels live in lib/nav.ts as English; this renders them for the reader. */
  locale: Locale;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  // Longest match wins, across the whole sidebar rather than row by row.
  //
  // Rows can nest — Pickup notes lives under /app/finance/pickup-notes while
  // Finance owns /app/finance — and matching each row independently lights up
  // both at once, which tells you two contradictory things about where you
  // are. The most specific row that matches is the one you are actually on.
  const activeHref = sections
    .flatMap((section) => section.items)
    .filter((item) => {
      const paths = [item.href, ...(item.alsoMatches ?? [])];
      return paths.some((path) =>
        item.exact
          ? pathname === path
          : pathname === path || pathname.startsWith(`${path}/`)
      );
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className={className}>
      {sections.map((section) => {
        const GroupIcon = section.group ? ICONS[section.group.icon] ?? Package : null;
        // A named group holds the row lit inside it, so the heading tells you
        // where you are even when its children are scrolled past.
        const inGroup = section.items.some((item) => item.href === activeHref);

        return (
        <div
          key={section.title}
          // Spacing is the separator for an ungrouped run. Groups this short do
          // not need to be named — "OVERVIEW" above two links told nobody
          // anything — so the heading is opt-in, for menus long enough that a
          // flat column becomes a wall.
          className={cn(section.group ? "mb-4 last:mb-0" : "mb-6 last:mb-0")}
        >
          {section.group && GroupIcon ? (
            <p
              className={cn(
                "flex items-center gap-2 px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                inGroup ? "text-foreground" : "text-muted-foreground/70"
              )}
            >
              <GroupIcon className="h-3.5 w-3.5 shrink-0" />
              {t(locale, section.group.label)}
            </p>
          ) : null}
          <ul
            className={cn(
              "space-y-0.5",
              // Indented against a hairline: the children read as belonging to
              // the heading rather than as more top-level rows that happen to
              // sit under it.
              section.group && "ml-[1.4rem] border-l border-border/60 pl-2"
            )}
          >
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Package;
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      // min-h-11 on a phone: 36px rows are a miss-tap away
                      // from each other, and this menu is used one-handed on a
                      // warehouse floor. Desktop keeps the tighter rhythm.
                      "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors lg:min-h-0",
                      active
                        ? "bg-brand/10 font-medium text-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(locale, item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}

function UserPanel({
  user,
  unread = 0,
}: {
  user: ShellUser;
  unread?: number;
}) {
  return (
    /*
      Never scrolls away, and never sits under a phone's home indicator.

      `shrink-0` is what keeps it on screen when the menu above it is long —
      without it a flex column hands the panel's height to the nav and pushes
      Sign out past the bottom edge. The safe-area padding is the difference
      between a button you can press and one that is technically visible
      underneath the gesture bar.
    */
    <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* The whole block is a link to the profile — the photo is the obvious
          thing to press for "my stuff", and it is where people reach first. */}
      <Link
        href="/app/profile"
        className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
      >
        <span className="relative shrink-0">
          {user.photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.photoUrl}
              alt=""
              className="h-9 w-9 rounded-full border object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {unread > 0 ? (
            <span
              title={`${unread} unread notification(s)`}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-brand-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {/* The role sits under the name on every screen in the product, so
                an English one here undoes the Chinese everywhere else. The
                English label stays the dictionary key. */}
            {t(user.locale, ROLE_LABELS[user.role])}
          </p>
        </div>
      </Link>
      {/*
        Beside the theme toggle, because it is the same kind of thing: how this
        person wants to read the screen. Offered to everyone — the Guangzhou
        desk needs it, and a Tanzanian manager checking what the China team
        actually typed needs it just as much. English is the default for every
        account, so nobody who does not want this ever meets it.
      */}
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <LanguageSwitch current={user.locale} />
        <ThemeToggle className="hidden h-8 w-8 lg:inline-flex" />
      </div>
      <Separator className="my-2" />
      <form action={logoutAction}>
        {/*
          Outlined rather than a ghost.

          A muted ghost button at the bottom of a dark sheet is a row of grey
          text among other rows of grey text; the one control people go looking
          for should not be the hardest one to find. Full width and h-11, which
          is the floor for something pressed with a thumb.
        */}
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full justify-start gap-2.5 px-3 text-sm"
        >
          <LogOut className="h-4 w-4" />
          {t(user.locale, "Sign out")}
        </Button>
      </form>
    </div>
  );
}
