import type { Role } from "@prisma/client";

import { can, type Permission } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  /** lucide-react icon name, resolved on the client. */
  icon: string;
  permission?: Permission;
  /** Match child routes too (e.g. /app/shipments/TX-000123). */
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
      { href: "/app/scan", label: "Scan QR", icon: "ScanLine" },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/app/shipments",
        label: "Shipments",
        icon: "Package",
        permission: "shipment.view",
      },
      {
        href: "/app/shipments/new",
        label: "New shipment",
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
        href: "/app/finance/pickup-notes",
        label: "Pickup notes",
        icon: "QrCode",
        permission: "pickupNote.issue",
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
