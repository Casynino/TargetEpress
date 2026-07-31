"use client";

import Link from "next/link";

import { NotificationBell } from "@/components/app/notification-bell";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  QrCode,
  ReceiptText,
  ScanLine,
  Truck,
  UserCog,
  Users,
  Wallet,
  UserRound,
  Bell,
  Inbox,
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
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
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
  QrCode,
  Users,
  ChartNoAxesCombined,
  UserCog,
  History,
  FlaskConical,
  UserRound,
  Bell,
  Inbox,
};

type ShellUser = {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
  photoUrl?: string | null;
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
    <div className="min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link href="/app/dashboard">
            <BrandLockup />
          </Link>
        </div>
        <NavList sections={sections} className="flex-1 overflow-y-auto p-3" />
        <UserPanel user={user} unread={unreadNotifications} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[270px] p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-16 items-center border-b px-5">
              <BrandLockup />
            </div>
            <NavList
              sections={sections}
              className="p-3"
              onNavigate={() => setMobileOpen(false)}
            />
            <UserPanel user={user} unread={unreadNotifications} />
          </SheetContent>
        </Sheet>

        <Link href="/app/dashboard">
          <BrandLockup subtitle={false} />
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell unread={unreadNotifications} />
          <ThemeToggle className="h-9 w-9" />
        </div>
      </div>

      <div className="lg:pl-64">
        {/* A thin bar for the bell alone. Anything else that wanted to live up
            here would be competing with the page's own heading. */}
        <div className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b bg-background/80 px-8 backdrop-blur lg:flex">
          <NotificationBell unread={unreadNotifications} />
        </div>
        <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}

function NavList({
  sections,
  className,
  onNavigate,
}: {
  sections: NavSection[];
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {sections.map((section) => (
        <div
          key={section.title}
          // Spacing is the whole separator. Groups this short do not need to be
          // named — "OVERVIEW" above two links told nobody anything.
          className="mb-6 last:mb-0"
        >
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Package;
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand/10 font-medium text-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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
    <div className="border-t p-3">
      {/* The whole block is a link to the profile — the photo is the obvious
          thing to press for "my stuff", and it is where people reach first. */}
      <Link
        href="/app/profile"
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
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
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
      </Link>
      <div className="flex justify-end px-2">
        <ThemeToggle className="hidden h-8 w-8 lg:inline-flex" />
      </div>
      <Separator className="my-2" />
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="ghost"
          className="w-full justify-start gap-2.5 px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </form>
    </div>
  );
}
