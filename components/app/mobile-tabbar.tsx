"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  Headset,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PackagePlus,
  PlaneTakeoff,
  ScanLine,
  Search,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

import { useT } from "@/components/app/locale-provider";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The doors a desk keeps under its thumb.
 *
 * WHY A BAR AT ALL. The Guangzhou desk opens this inside WeChat's browser: no
 * back button, no address bar, no tabs. Everything the drawer holds is two
 * gestures away — press the hamburger, find the row — and the screens a floor
 * uses forty times a shift should be one. The drawer is still the whole menu;
 * this is the handful of rows that stop being a menu and become the app.
 *
 * WHY PER ROLE. A Dar phone and the CEO's phone are the same build and not the
 * same job. Dar lives in Receive and Release, Guangzhou in Receive cargo and
 * Loading batches, Support in the call list, Finance in Collections. One shared
 * five would be right for nobody, so each desk gets its own four and the fifth
 * slot is always the way into everything else.
 *
 * WHY FOUR AND NOT SIX. A fifth destination puts every target under 60px on a
 * 360px phone, which is below what a thumb hits while the other hand is holding
 * a box — the same reason the hamburger above is 44px and not 36px.
 */
type Tab = {
  href: string;
  icon: LucideIcon;
  /** Match this path only, never its children. */
  exact?: boolean;
  /**
   * Overrides the sidebar's own wording, and only where that wording depends on
   * the heading above it to mean anything.
   *
   * "Overview" is honest under a FINANCE group and says nothing at all beside
   * Home on a bar. Everywhere else the label is taken from the role's menu on
   * purpose — see below.
   */
  label?: string;
};

const TABS: Record<Role, Tab[]> = {
  // The owner: what landed, and what it earned. The chase lists and the staff
  // pages are deliberately in the drawer — they are opened at a desk, on a
  // week's evidence, not one-handed between meetings.
  ADMIN: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/shipments", icon: PlaneTakeoff },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  /* The manager's four: their own command centre, the search every role gets,
     the money owed — which is what a manager chases on a phone — and the
     department overview. Cargo lists live one tap further in the drawer,
     because a manager reads them at a desk and rings about money on the move. */
  MANAGER: [
    { href: "/app/manager", icon: LayoutDashboard, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/collections/follow-up", icon: Banknote },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  // Guangzhou registers cargo and loads batches; it never receives or releases
  // any. Requests stays in the drawer — ringing a booking back is a sit-down
  // job, taking in a box is not.
  CHINA_WAREHOUSE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/cargo/new", icon: PackagePlus },
    { href: "/app/batches", icon: Boxes },
  ],
  // The Dar floor works a line: a box lands and is checked in, a customer
  // arrives and it is scanned out. Those two screens are the shift.
  DAR_WAREHOUSE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/receive", icon: PackagePlus },
    { href: "/app/release", icon: ScanLine },
  ],
  FINANCE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/collections/follow-up", icon: Banknote },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  // Home is /app/support, not /app/dashboard: the shared dashboard renders
  // nothing for this desk, which is why their menu hides it (REDUNDANT_ROWS).
  // Both of their queues ride the bar because both are answered with a customer
  // already on the phone.
  CUSTOMER_CARE: [
    { href: "/app/support", icon: Headset, exact: true },
    { href: "/app/search", icon: Search },
    { href: "/app/support/tickets", icon: MessageSquare },
    { href: "/app/collections/follow-up", icon: Banknote },
  ],
};

export function MobileTabbar({
  sections,
  role,
  onMore,
}: {
  /** The role's own menu, already permission-filtered by navForRole(). */
  sections: NavSection[];
  role: Role;
  /** Opens the drawer that already exists in the shell. */
  onMore: () => void;
}) {
  const pathname = usePathname() ?? "";
  const t = useT();

  /*
    Labels and permissions both come from the role's own menu.

    THE NAME: this bar must not invent one. "Issues & Claims" is called that in
    every sidebar because staff ring each other about that page, and a second
    name for it is one misunderstanding a day — a tab bar with its own shorter
    words would be exactly that, on the screen people press most.

    THE GATE: a tab whose row is not in this menu is a tab this role cannot
    open. Reading the filtered menu rather than re-deriving from permissions
    means the bar can never offer a door that answers "That area is not yours",
    and can never drift from the sidebar when a permission moves.
  */
  const labels = new Map<string, string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (!labels.has(item.href)) labels.set(item.href, item.label);
    }
  }

  // `?? []` is for a session carrying a role this bundle has never heard of —
  // an old tab open across a deploy that added a department. The Record type
  // above still forces every known role to be listed; this only decides
  // whether the unknown one gets no bar or a white screen.
  const tabs = (TABS[role] ?? []).filter((tab) => labels.has(tab.href));
  if (tabs.length === 0) return null;

  // Longest match wins, across the bar rather than tab by tab — the same rule
  // the sidebar uses. /app/finance and /app/finance/credit both match while you
  // are on the credit page, and lighting both says two contradictory things
  // about where you are.
  const activeHref = tabs
    .filter((tab) =>
      tab.exact
        ? pathname === tab.href
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    /*
      Hidden on a desktop AND on paper.

      `lg:hidden` alone reads as "phones only", but a print page is about 794px
      — under the lg breakpoint — so a browser printing this would render the
      bar onto the sheet. On a 100x70mm cargo label that is 3.7mm of a 70mm
      page, which is the difference between a sticker and a reprint.

      z-40, under the drawer's z-50: pressing More must not leave a row of tabs
      floating on top of the menu it just opened.
    */
    <nav
      aria-label={t("Navigation")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div className="flex h-14 items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              /*
                `flex-1` over a fixed width: five equal columns on a 320px phone
                are 64px wide and 56px tall, which clears the 44px floor on both
                axes with the label still centred under its icon.
              */
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 transition-colors active:bg-accent",
                active ? "text-brand" : "text-muted-foreground"
              )}
            >
              {/*
                Current is a mark, a weight and a colour — never colour alone.
                Half this workforce reads this bar in direct sun on a warehouse
                floor, and a navy-versus-grey difference does not survive that,
                let alone a colour-blind pair of eyes.
              */}
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-brand"
                />
              ) : null}
              <Icon
                className="h-5 w-5 shrink-0"
                strokeWidth={active ? 2.5 : 2}
              />
              {/*
                Two lines allowed, and the icons still line up because the
                column starts from the top rather than centring itself.

                The menu's own words are long in English — "Receiving Dock",
                "Scan & release" — and truncating them to "Receiving D…" on the
                narrowest phones would hide the half that says which dock. In
                Chinese, which is what Guangzhou reads, every one of them is two
                to four characters and never wraps at all.
              */}
              <span className="line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-[1.15]">
                {t(tab.label ?? labels.get(tab.href) ?? "")}
              </span>
            </Link>
          );
        })}

        {/*
          The fifth slot opens the drawer that is already there — the same Sheet
          the hamburger opens, controlled by the same state. A second menu here
          would be a second place to forget a row.

          "Navigation", because that is the string the dictionary already
          carries (菜单). A fresh "More" would render English on the one phone
          this whole bar was built for.
        */}
        <button
          type="button"
          onClick={onMore}
          className="flex min-w-0 flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 text-muted-foreground transition-colors active:bg-accent"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-[1.15]">
            {t("Navigation")}
          </span>
        </button>
      </div>
    </nav>
  );
}
