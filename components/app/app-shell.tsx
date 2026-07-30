"use client";

import Link from "next/link";
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
};

type ShellUser = {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
};

export function AppShell({
  sections,
  user,
  children,
}: {
  sections: NavSection[];
  user: ShellUser;
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
        <UserPanel user={user} />
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
            <UserPanel user={user} />
          </SheetContent>
        </Sheet>

        <Link href="/app/dashboard">
          <BrandLockup subtitle={false} />
        </Link>

        <ThemeToggle className="h-9 w-9" />
      </div>

      <div className="lg:pl-64">
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
        <div key={section.title} className="mb-5">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {section.title}
          </p>
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

function UserPanel({ user }: { user: ShellUser }) {
  return (
    <div className="border-t p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
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
