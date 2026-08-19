import Link from "next/link";
import {
  Banknote,
  Boxes,
  FileText,
  LayoutDashboard,
  Landmark,
  Package,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

/**
 * The whole system, one press away.
 *
 * NAVIGATION, NOT A SUMMARY. Every other strip on this page carries a figure;
 * this one deliberately carries none, because the moment a nav chip shows a
 * count it becomes a tenth place the same number is printed and the manager has
 * to work out which of the two is authoritative. These are doors.
 *
 * Each is gated on the permission that guards the route behind it, so the row
 * can never offer a door that opens onto "no access" — and it thins itself
 * honestly rather than showing a manager something they cannot have.
 *
 * One line, scrolling sideways on a phone rather than wrapping. A nav bar that
 * wraps to three rows on a narrow screen stops reading as a bar.
 */
type Door = { href: string; label: string; icon: LucideIcon; permission?: string };

const DOORS: Door[] = [
  { href: "/app/manager", label: "Overview", icon: LayoutDashboard },
  { href: "/app/manager/operations", label: "Operations", icon: Package, permission: "batch.view" },
  { href: "/app/finance", label: "Finance", icon: Wallet, permission: "accounting.view" },
  { href: "/app/manager/accounts", label: "Accounts", icon: Landmark, permission: "account.view" },
  { href: "/app/manager/batches", label: "Batches", icon: Boxes, permission: "profit.view" },
  { href: "/app/customers", label: "Customers", icon: Users, permission: "customer.view" },
  { href: "/app/admin/users", label: "Staff", icon: Users, permission: "user.manage" },
  { href: "/app/manager/payroll", label: "Payroll", icon: Banknote, permission: "payroll.approve" },
  { href: "/app/manager/reports", label: "Reports", icon: FileText, permission: "report.view" },
];

export function ManagerNav({
  locale,
  role,
  current,
}: {
  locale: Locale;
  role: Role;
  /** Which door the reader is standing in, so it reads as a place not a link. */
  current?: string;
}) {
  const doors = DOORS.filter(
    (d) => !d.permission || can(role, d.permission as never)
  );

  return (
    <nav
      aria-label={t(locale, "Sections")}
      /* One line, scrolling rather than wrapping — and the scrollbar hidden,
         because a horizontal bar under nine chips reads as a broken layout. */
      className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {doors.map((d) => {
        const here = current === d.href;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-current={here ? "page" : undefined}
            className={cn(
              "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              here
                ? "border-transparent bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <d.icon className="h-3.5 w-3.5" />
            {t(locale, d.label)}
          </Link>
        );
      })}
    </nav>
  );
}
