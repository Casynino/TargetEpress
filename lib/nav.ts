import type { Role } from "@prisma/client";

import { can, type Permission } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  /** lucide-react icon name, resolved on the client. */
  icon: string;
  permission?: Permission;
  /** Match child routes too (e.g. /app/cargo/TX-000123). */
  exact?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
      {
        href: "/app/scan",
        label: "Scan QR",
        icon: "ScanLine",
        // The China desk prints labels; it never scans them. Offering the link
        // there implies a workflow that does not exist.
        permission: "shipment.scan",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      // The standalone cargo list is deliberately absent. A mixed list of every
      // piece of cargo in the business tells you nothing about which shipment
      // it is on or where it is; cargo is reached from inside a shipment or a
      // batch, where it has context. The routes still exist so QR labels and
      // saved links resolve.
      {
        href: "/app/cargo/new",
        label: "Register cargo",
        icon: "PackagePlus",
        permission: "shipment.create",
      },
      {
        href: "/app/batches",
        label: "Batches",
        icon: "Boxes",
        permission: "batch.view",
      },
      {
        href: "/app/shipments",
        label: "Shipments",
        icon: "PlaneTakeoff",
        permission: "batch.view",
      },
      {
        href: "/app/receive",
        label: "Receive & verify",
        icon: "ClipboardCheck",
        permission: "batch.receive",
      },
      {
        href: "/app/release",
        label: "Release cargo",
        icon: "Truck",
        permission: "shipment.release",
      },
      {
        href: "/app/exceptions",
        label: "Exceptions",
        icon: "TriangleAlert",
        permission: "exception.raise",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/app/finance",
        label: "Overview",
        icon: "Wallet",
        permission: "finance.view",
        exact: true,
      },
      {
        href: "/app/finance/invoices",
        label: "Invoices",
        icon: "ReceiptText",
        permission: "invoice.manage",
      },
      {
        href: "/app/finance/payments",
        label: "Payments",
        icon: "Banknote",
        permission: "payment.record",
      },
      {
        href: "/app/finance/exchange-rate",
        label: "Exchange rate",
        icon: "ArrowLeftRight",
        permission: "fx.manage",
      },
      {
        href: "/app/finance/pickup-notes",
        label: "Pickup notes",
        icon: "QrCode",
        permission: "pickupNote.issue",
      },
    ],
  },
  {
    title: "Support desk",
    items: [
      {
        href: "/app/support",
        label: "Support home",
        icon: "Headset",
        permission: "ticket.manage",
        exact: true,
      },
      {
        href: "/app/support/tickets",
        label: "Tickets",
        icon: "MessageSquare",
        permission: "ticket.manage",
      },
      {
        href: "/app/support/sourcing",
        label: "Sourcing requests",
        icon: "ShoppingBag",
        permission: "sourcing.manage",
      },
      {
        href: "/app/support/follow-up",
        label: "Payment follow-up",
        icon: "PhoneCall",
        permission: "ticket.manage",
      },
      {
        href: "/app/support/markets",
        label: "China markets",
        icon: "Store",
        permission: "sourcing.manage",
      },
    ],
  },
  {
    title: "Records",
    items: [
      {
        href: "/app/customers",
        label: "Customers",
        icon: "Users",
        permission: "customer.view",
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        href: "/app/admin/reports",
        label: "Reports",
        icon: "ChartNoAxesCombined",
        permission: "report.view",
      },
      {
        href: "/app/admin/pricing",
        label: "Products & pricing",
        icon: "Tags",
        permission: "pricing.manage",
      },
      {
        href: "/app/admin/markets",
        label: "China markets",
        icon: "Store",
        permission: "pricing.manage",
      },
      {
        href: "/app/admin/users",
        label: "Staff",
        icon: "UserCog",
        permission: "user.manage",
      },
      {
        href: "/app/admin/audit",
        label: "Audit log",
        icon: "History",
        permission: "audit.view",
      },
      {
        href: "/app/admin/test-data",
        label: "Test data",
        icon: "FlaskConical",
        permission: "user.manage",
      },
    ],
  },
];

/** Drops every item and every empty section the role cannot reach. */
export function navForRole(role: Role): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || can(role, item.permission)
    ),
  })).filter((section) => section.items.length > 0);
}
