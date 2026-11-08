"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Bell,
  Boxes,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Globe,
  Headset,
  History,
  Inbox,
  Landmark,
  Languages,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Package,
  PackagePlus,
  PhoneCall,
  PlaneTakeoff,
  QrCode,
  Receipt,
  ReceiptText,
  Scale,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Sun,
  Tags,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { BrandMark } from "@/components/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose } from "@/components/ui/sheet";
import { logoutAction } from "@/lib/actions/auth";
import { setLanguage } from "@/lib/actions/language";
import { ROLE_LABELS } from "@/lib/constants";
import { LOCALE_LABELS, type Locale } from "@/lib/locale";
import type { NavItem, NavSection } from "@/lib/nav";
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
  Layers,
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

export type ShellUser = {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
  photoUrl?: string | null;
  /** Which language this person reads the system in. */
  locale: Locale;
};

/** Which sidebar groups the reader opened or folded, per device. */
const NAV_FOLD_KEY = "tx.nav.folds";

const LABEL = "pb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] g-dim";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function activeHrefFor(sections: NavSection[], pathname: string) {
  // Longest match wins, across the whole sidebar rather than row by row.
  //
  // Rows can nest — Pickup notes lives under /app/finance/pickup-notes while
  // Finance owns /app/finance — and matching each row independently lights up
  // both at once. The most specific row that matches is the one you are on.
  return sections
    .flatMap((section) => section.items)
    .filter((item) => {
      const paths = [item.href, ...(item.alsoMatches ?? [])];
      return paths.some((path) =>
        item.exact
          ? pathname === path
          : pathname === path || pathname.startsWith(`${path}/`),
      );
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/*
  FOLDING GROUPS: a group opens and closes its pages.

  Until the reader decides, the group holding the page they are on is open and
  the rest are folded — a long menu reads as its headings. What they open or
  fold is remembered on this device, and going to a page inside a folded group
  opens that group again so the lit row is never hidden.
*/
function useFolds(sections: NavSection[], activeHref: string | undefined) {
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setOpened(JSON.parse(localStorage.getItem(NAV_FOLD_KEY) ?? "{}") as Record<string, boolean>);
    } catch {
      /* private window: the defaults stand */
    }
  }, []);
  const activeGroup = sections.find(
    (section) => section.group && section.items.some((item) => item.href === activeHref),
  )?.title;
  useEffect(() => {
    if (activeGroup && opened[activeGroup] === false) {
      setOpened((current) => ({ ...current, [activeGroup]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);
  const set = (title: string, open: boolean) =>
    setOpened((current) => {
      const next = { ...current, [title]: open };
      try {
        localStorage.setItem(NAV_FOLD_KEY, JSON.stringify(next));
      } catch {
        /* the fold still works for this visit */
      }
      return next;
    });
  return { opened, set };
}

/**
 * THE SIDEBAR: the Super Drive glass panel, on every portal.
 *
 * The owner asked for it copied exactly (8 Nov 2026): a tall, very round,
 * frosted panel — navy glass at night, white glass by day — with the opening
 * pages under MAIN and the folding groups under WORKSPACE, the open page a
 * bright-ringed pill with a gold icon, Night mode and the person at the
 * bottom. The round button on its edge folds it to a rail where every page is
 * its own icon. The look lives in globals.css (.glass-*).
 *
 * One component draws it for the desktop and for the phone's drawer, so the
 * two can never drift apart.
 */
export function GlassSidebar({
  mode,
  sections,
  user,
  unread = 0,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: {
  mode: "desktop" | "sheet";
  sections: NavSection[];
  user: ShellUser;
  unread?: number;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  onNavigate?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const activeHref = activeHrefFor(sections, pathname);
  const folds = useFolds(sections, activeHref);
  const rail = mode === "desktop" && collapsed;
  // The phone's drawer, as on Hao Stock (owner, 8 Nov 2026): read close up
  // with no room to spare, so it runs a size smaller and shows its pages.
  const sheet = mode === "sheet";

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const focusAfterOpen = useRef(false);
  const [shortcut, setShortcut] = useState("⌘K");
  useEffect(() => {
    if (!/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setShortcut("Ctrl K");
  }, []);
  useEffect(() => setQuery(""), [pathname]);

  // ⌘K / Ctrl K reaches the page search from anywhere; [ folds and unfolds.
  useEffect(() => {
    if (mode !== "desktop") return;
    const onKey = (event: KeyboardEvent) => {
      if (window.innerWidth < 1024) return;
      const el = event.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (collapsed) {
          focusAfterOpen.current = true;
          onCollapsedChange?.(false);
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      } else if (event.key === "[" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        onCollapsedChange?.(!collapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, collapsed, onCollapsedChange]);
  useEffect(() => {
    if (!collapsed && focusAfterOpen.current) {
      focusAfterOpen.current = false;
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [collapsed]);

  // Search runs over every page this person can open, in either language.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const seen = new Set<string>();
    const out: { item: NavItem; where: string | null }[] = [];
    for (const section of sections) {
      for (const item of section.items) {
        if (seen.has(item.href)) continue;
        // A group's name finds its pages too: "batch" finds Loading, Arrived
        // and Closed, which never say the word themselves.
        const words = [t(item.label), item.label];
        if (section.group) words.push(t(section.group.label), section.group.label);
        if (!words.some((word) => word.toLowerCase().includes(q))) continue;
        seen.add(item.href);
        out.push({ item, where: section.group ? t(section.group.label) : null });
      }
    }
    return out;
  }, [query, sections, t]);

  /* The name beside a rail icon. Fixed to the viewport and drawn outside the
     panel: the panel's frosted glass would otherwise trap it, and the list
     scrolling inside it would cut it off at the edge. */
  const [hint, setHint] = useState<{ label: string; x: number; y: number } | null>(null);
  const showHint = (target: EventTarget | null) => {
    const el = rail ? (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-hint]") : null;
    if (!el) {
      setHint(null);
      return;
    }
    const box = el.getBoundingClientRect();
    setHint({ label: el.dataset.hint ?? "", x: box.right + 12, y: box.top + box.height / 2 });
  };

  const brand = (compact: boolean) => (
    <Link
      href="/app/dashboard"
      onClick={onNavigate}
      data-hint="Target Express"
      className={cn("flex min-w-0 items-center rounded-full", sheet ? "gap-2.5" : "gap-3", FOCUS)}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-white ring-2 ring-[#fdc400]/45",
          sheet ? "size-9" : "size-10",
        )}
      >
        <BrandMark tone="paper" className={cn("w-auto translate-x-px", sheet ? "h-4" : "h-[18px]")} />
      </span>
      {compact ? null : (
        /* The company's name, left in English on a Chinese screen like the
           wordmark it is — see BrandLockup. */
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate font-semibold tracking-tight g-strong", sheet ? "text-[13px]" : "text-sm")}>
            Target Express
          </span>
          <span className={cn("mt-0.5 block truncate g-soft", sheet ? "text-[11px]" : "text-xs")}>Air Cargo</span>
        </span>
      )}
    </Link>
  );

  const row = (item: NavItem, child = false, where: string | null = null) => {
    const Icon = ICONS[item.icon] ?? Package;
    const active = item.href === activeHref;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex items-center rounded-lg",
            FOCUS,
            sheet
              ? cn("gap-2.5 px-2.5 text-[12.5px]", child ? "min-h-7 py-1" : "min-h-8 py-1.5")
              : cn("gap-3 text-[13px]", child ? "px-3 py-1.5" : "px-3 py-2"),
            active ? "glass-active font-medium g-strong" : "glass-row g-text g-hover",
          )}
        >
          <Icon
            className={cn(
              "shrink-0",
              child ? (sheet ? "size-[15px]" : "size-4") : sheet ? "size-4" : "size-[18px]",
              active && "g-gold",
            )}
          />
          <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
          {/* Which group a search result lives in, so two "Arrived" rows are told apart. */}
          {where ? <span className="shrink-0 text-[11px] g-soft">{where}</span> : null}
        </Link>
      </li>
    );
  };

  const firstGroup = sections.findIndex((section) => section.group);

  /** The full menu: name, search, MAIN, WORKSPACE (folding groups with branches), Night mode and the person. */
  const full = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center justify-between gap-2", sheet ? "px-3 pb-2 pr-3 pt-3" : "px-4 pb-3 pr-7 pt-4")}>
        {brand(false)}
        {mode === "sheet" ? (
          <SheetClose asChild>
            <button type="button" className={cn("glass-row grid size-8 shrink-0 place-items-center rounded-full g-text", FOCUS)}>
              <X className="size-4" />
              <span className="sr-only">{t("Close")}</span>
            </button>
          </SheetClose>
        ) : null}
      </div>

      <div className={cn("pb-1.5", sheet ? "px-2.5" : "px-3")}>
        <label
          className={cn(
            "glass-field flex items-center gap-2.5 g-soft",
            sheet ? "px-2.5 py-1.5 text-[13px]" : "px-3.5 py-2 text-sm",
          )}
        >
          <Search className={cn("shrink-0", sheet ? "size-[15px]" : "size-4")} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results?.[0]) {
                event.preventDefault();
                setQuery("");
                onNavigate?.();
                router.push(results[0].item.href);
              } else if (event.key === "Escape") {
                if (query) setQuery("");
                else event.currentTarget.blur();
              }
            }}
            placeholder={t("Search pages")}
            aria-label={t("Search pages")}
            className={cn("g-input g-strong min-w-0 flex-1 bg-transparent outline-none", sheet ? "text-[13px]" : "text-sm")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="g-soft g-hover grid size-5 shrink-0 place-items-center rounded-full"
            >
              <X className="size-3.5" />
              <span className="sr-only">{t("Clear search")}</span>
            </button>
          ) : (
            <kbd className="glass-kbd g-soft hidden shrink-0 rounded-md px-1.5 py-0.5 font-sans text-[10px] font-semibold lg:block">
              {shortcut}
            </kbd>
          )}
        </label>
      </div>

      <nav
        aria-label={t("Navigation")}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-width:thin]"
      >
        {results ? (
          results.length ? (
            <ul className="mt-2 space-y-0.5">{results.map(({ item, where }) => row(item, false, where))}</ul>
          ) : (
            <p className="g-soft px-4 py-6 text-center text-sm">{t("No page matches that.")}</p>
          )
        ) : (
          sections.map((section, index) => {
            const GroupIcon = section.group ? (ICONS[section.group.icon] ?? Package) : null;
            // MAIN over the pages that open the menu, WORKSPACE over the
            // groups; a page or two after the groups sits under a hairline,
            // keeping the order each desk's menu was given.
            const heading =
              index === 0 && !section.group ? t("Main") : index === firstGroup ? t("Workspace") : null;
            const afterGroups = !section.group && firstGroup !== -1 && index > firstGroup;

            if (!section.group || !GroupIcon) {
              return (
                <div key={section.title} className={cn(index > 0 && !afterGroups && "mt-2")}>
                  {heading ? <p className={cn(LABEL, sheet ? "px-3 pt-2.5" : "px-4 pt-3")}>{heading}</p> : null}
                  {afterGroups ? <div aria-hidden className="glass-divider mx-3 my-2.5" /> : null}
                  <ul className="space-y-0.5">{section.items.map((item) => row(item))}</ul>
                </div>
              );
            }

            const here = section.items.some((item) => item.href === activeHref);
            // On a phone the drawer is opened because somebody wants to GO
            // somewhere, so its groups start open and show their pages.
            const isOpen = folds.opened[section.title] ?? (sheet || here);
            return (
              <div key={section.title} className="mt-0.5">
                {heading ? <p className={cn(LABEL, sheet ? "px-3 pt-3" : "px-4 pt-4")}>{heading}</p> : null}
                <button
                  type="button"
                  onClick={() => folds.set(section.title, !isOpen)}
                  aria-expanded={isOpen}
                  className={cn(
                    "glass-row g-hover flex w-full items-center rounded-lg text-left font-medium",
                    FOCUS,
                    sheet ? "min-h-8 gap-2.5 px-2.5 py-1.5 text-[12.5px]" : "gap-3 px-3 py-2 text-[13px]",
                    here ? "g-strong" : "g-text",
                  )}
                >
                  <GroupIcon className={cn("shrink-0", sheet ? "size-4" : "size-[18px]", here ? "g-gold" : "g-icon")} />
                  <span className="min-w-0 flex-1 truncate">{t(section.group.label)}</span>
                  <ChevronDown
                    className={cn("g-icon size-[15px] shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden" inert={!isOpen}>
                    <ul className="glass-tree ml-[1.7rem] mt-1 space-y-0.5 pb-1 pl-3.5">
                      {section.items.map((item) => row(item, true))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>

      <Footer mode={mode} rail={false} user={user} unread={unread} onNavigate={onNavigate} />
    </div>
  );

  /** The narrow rail: only icons, thin lines between the sets, Night mode and the person. */
  const railView = (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <div className="pb-2 pt-4">{brand(true)}</div>
      <button
        type="button"
        data-hint={t("Search pages")}
        onClick={() => {
          focusAfterOpen.current = true;
          onCollapsedChange?.(false);
        }}
        className={cn("glass-row g-text g-hover mb-1 grid size-11 shrink-0 place-items-center rounded-full", FOCUS)}
      >
        <Search className="size-[18px]" />
        <span className="sr-only">{t("Search pages")}</span>
      </button>
      <nav
        aria-label={t("Navigation")}
        className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Every page is its own icon, a plain link: nothing opens, its name
            appears beside it on hover. */}
        {sections.map((section) => (
          <div key={section.title} className="flex w-full flex-col items-center">
            <div aria-hidden className="glass-divider my-1.5 w-7" />
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Package;
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-hint={t(item.label)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative mb-0.5 grid size-10 shrink-0 place-items-center rounded-full",
                    FOCUS,
                    active ? "glass-active g-strong" : "glass-row g-soft g-hover",
                  )}
                >
                  <Icon className={cn("size-[17px]", active && "g-gold")} />
                  <span className="sr-only">{t(item.label)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Footer mode={mode} rail user={user} unread={unread} onNavigate={onNavigate} />
    </div>
  );

  if (mode === "sheet") {
    return <div className="glass-panel glass-drawer h-full">{full}</div>;
  }

  return (
    <aside
      aria-label={t("Navigation")}
      onPointerOver={(event) => showHint(event.target)}
      onPointerLeave={() => setHint(null)}
      onFocusCapture={(event) => showHint(event.target)}
      onBlurCapture={() => setHint(null)}
      className={cn(
        "fixed left-3 top-3 z-30 hidden lg:block print:hidden",
        rail ? "w-[4.5rem]" : "bottom-3 w-56",
      )}
    >
      <div className={cn("glass-panel flex flex-col", rail ? "max-h-[calc(100dvh-1.5rem)]" : "h-full")}>
        {rail ? railView : full}
      </div>

      {/* Fold and unfold, on the panel's own edge. */}
      <div className="group absolute -right-3.5 top-[1.65rem] z-10">
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          aria-expanded={!collapsed}
          className="glass-chip grid size-7 place-items-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.4)] ring-1 ring-black/10 outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#fdc400] dark:ring-white/10"
        >
          {collapsed ? (
            <ChevronRight className="size-[15px]" strokeWidth={2.5} />
          ) : (
            <ChevronLeft className="size-[15px]" strokeWidth={2.5} />
          )}
          <span className="sr-only">{collapsed ? t("Expand") : t("Collapse")}</span>
        </button>
        <span className="glass-chip pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold opacity-0 shadow-lg transition group-hover:opacity-100">
          {collapsed ? t("Expand") : t("Collapse")}{" "}
          <kbd className="ml-1 rounded bg-black/5 px-1 font-sans text-[10px] opacity-70 dark:bg-white/10">[</kbd>
        </span>
      </div>

      {hint ? (
        <span
          role="tooltip"
          className="glass-chip pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold shadow-lg"
          style={{ left: hint.x, top: hint.y }}
        >
          {hint.label}
        </span>
      ) : null}
    </aside>
  );
}

/**
 * The bottom of the panel, as on Super Drive: only the signed-in person, as
 * initials and the first name — no icons (owner, 8 Nov 2026). A small menu
 * opens from it: the full name and role, My profile, Notifications with the
 * unread count, the night or day look, the other language written in itself,
 * Main site, Sign out. On a computer the bell and the night switch are also in
 * each desk's banner; this menu is where they live on every other page and on
 * a phone. In the rail only the initials show.
 */
function Footer({
  mode,
  rail,
  user,
  unread,
  onNavigate,
}: {
  mode: "desktop" | "sheet";
  rail: boolean;
  user: ShellUser;
  unread: number;
  onNavigate?: () => void;
}) {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";

  const [, start] = useTransition();
  const other: Locale = user.locale === "zh" ? "en" : "zh";
  const role = t(ROLE_LABELS[user.role]);
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const item = "gap-2 rounded-lg px-2.5 py-1.5 text-[13px]";

  return (
    <div
      className={cn(
        "shrink-0",
        rail ? "flex flex-col items-center pb-3" : "px-3 pb-3",
        mode === "sheet" && "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div aria-hidden className="glass-divider mb-2 w-full" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={user.name}
            data-hint={user.name}
            className={cn(
              "glass-row flex w-full items-center gap-3 rounded-full text-left",
              FOCUS,
              rail ? "justify-center p-1" : mode === "sheet" ? "px-1.5 py-1.5" : "px-2 py-2",
            )}
          >
            <span
              className={cn(
                "relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1f4e8c] to-[#0e2a52] text-xs font-semibold text-white ring-1 ring-white/25",
                mode === "sheet" ? "size-9" : "size-10",
              )}
            >
              {user.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={user.photoUrl} alt="" className={cn("rounded-full object-cover", mode === "sheet" ? "size-9" : "size-10")} />
              ) : (
                initials(user.name)
              )}
            </span>
            {/* Only the first name here; the full name and the role are in the
                menu that opens from it. */}
            {rail ? (
              <span className="sr-only">{user.name}</span>
            ) : (
              <span className={cn("g-strong min-w-0 flex-1 truncate font-semibold", mode === "sheet" ? "text-[13px]" : "text-sm")}>
                {firstName}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={rail ? "right" : "top"}
          align={rail ? "end" : "start"}
          sideOffset={rail ? 12 : 8}
          className="w-48 rounded-xl p-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.55)]"
        >
          <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 font-normal">
            <span className="block break-words text-[13px] font-semibold leading-snug">{user.name}</span>
            {/* The role sits under the name on every screen in the product, so
                an English one here undoes the Chinese everywhere else. */}
            <span className="block truncate text-[11px] text-muted-foreground">{role}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem asChild className={item}>
            <Link href="/app/profile" onClick={onNavigate}>
              <UserRound className="size-3.5" />
              {t("Profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={item}>
            <Link href="/app/notifications" onClick={onNavigate}>
              <Bell className="size-3.5" />
              <span className="flex-1">{t("Notifications")}</span>
              {unread > 0 ? (
                <span className="rounded-full bg-signal px-1.5 text-[10px] font-bold leading-4 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
          {/* One word each in this menu (owner, 8 Nov 2026): the look it
              switches TO, the language it switches TO. */}
          <DropdownMenuItem
            className={item}
            aria-label={dark ? t("Switch to light mode") : t("Switch to dark mode")}
            onSelect={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            {dark ? t("Light") : t("Dark")}
          </DropdownMenuItem>
          {/* The other language, written in itself, so the person who cannot
              read the screen yet can still find it. */}
          <DropdownMenuItem className={item} onSelect={() => start(() => void setLanguage(other))}>
            <Languages className="size-3.5" />
            {LOCALE_LABELS[other]}
          </DropdownMenuItem>
          {/* The way out to the public site: a computer has no top bar now. */}
          <DropdownMenuItem asChild className={item}>
            <Link href="/" onClick={onNavigate}>
              <Globe className="size-3.5" />
              {t("Website")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={cn(item, "text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400")}
            // Called straight: a menu item cannot submit a form, and a hidden
            // form kept only to be submitted from here is one more thing to
            // keep in step with the server's copy of the page.
            onSelect={() => start(() => logoutAction())}
          >
            <LogOut className="size-3.5" />
            {t("Logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

    </div>
  );
}
