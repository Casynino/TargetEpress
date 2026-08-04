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
  /** Used as a React key and to reason about the file. Never rendered — the
   *  groups are told apart by spacing, which is enough for six links. */
  title: string;
  items: NavItem[];
};

/**
 * The sidebar: the work, and nothing else.
 *
 * Section titles are not rendered — with five links, a heading above them is
 * furniture rather than a signpost.
 *
 * Three things people expect to find here are deliberately elsewhere, because
 * each already has a better home. Notifications are a bell in the top right,
 * where the count is visible without opening anything. Your profile is your own
 * name at the bottom of this sidebar. Floor activity is on that profile, next
 * to your own. Every one of them would otherwise be a second door to a room
 * that already has one.
 */
const SECTIONS: NavSection[] = [
  {
    title: "Work",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
      // The standalone cargo list is deliberately absent. A mixed list of every
      // piece of cargo in the business tells you nothing about which shipment
      // it is on or where it is; cargo is reached from inside a shipment or a
      // batch, where it has context. The routes still exist so QR labels and
      // saved links resolve.
      {
        href: "/app/cargo/new",
        label: "Receive cargo",
        icon: "PackagePlus",
        permission: "shipment.create",
      },
      {
        href: "/app/requests",
        label: "Requests",
        icon: "Inbox",
        // Bookings and pickups off the website. The desk that receives cargo is
        // the desk that rings these people back.
        permission: "shipment.create",
      },
      {
        href: "/app/shipments",
        label: "Shipments",
        icon: "PlaneTakeoff",
        permission: "batch.view",
      },
      {
        href: "/app/batches",
        label: "Batches",
        icon: "Boxes",
        permission: "batch.view",
      },
      {
        href: "/app/customers",
        label: "Customers",
        icon: "Users",
        permission: "customer.view",
      },
      {
        href: "/app/scan",
        label: "Scan QR",
        icon: "ScanLine",
        // The China desk prints labels; it never scans them. Offering the link
        // there implies a workflow that does not exist.
        permission: "shipment.scan",
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
        // Named for what the desk does there rather than for the database word:
        // it is where flagged cargo is chased until it is found or written off.
        label: "Investigation queue",
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
        href: "/app/admin/deleted",
        label: "Deleted records",
        icon: "Trash2",
        permission: "shipment.cancel",
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

/**
 * Dar warehouse gets its own menu rather than a filtered slice of the shared
 * one.
 *
 * Filtering produced a menu in the wrong words: "Receive & verify" is two jobs
 * to that floor, "Shipments" is everything ever flown when what they want is
 * what is landing this week, and "Batches" is a door into work that is China's.
 * The floor works a line — arrivals, receive, verify, store, hand over — so the
 * menu is that line, in that order.
 *
 * Every item still declares its permission and is still filtered below, so this
 * is a different arrangement of the same gates, never a way around them.
 */
const DAR_SECTIONS: NavSection[] = [
  {
    // Dashboard, then the two ways in.
    //
    // Scan and search are not a stage of the work — they are how every job on
    // this floor starts: a box arrives and somebody reads its label, a customer
    // asks and somebody looks the number up. Filed under "handover" they sat
    // behind the one task that happens least. Dashboard keeps the top spot
    // because that is where every app puts it and nobody should have to learn
    // otherwise.
    //
    // They are not a stage of the work — they are how every job on this floor
    // starts. A box arrives and somebody reads its label; a customer asks and
    // somebody looks the number up. Filed under "handover" they sat behind the
    // one task that happens least, which is the wrong way round for the two
    // links this desk touches most.
    title: "Find it",
    items: [
      {
        href: "/app/dashboard",
        label: "Dashboard",
        icon: "LayoutDashboard",
        exact: true,
      },
      {
        href: "/app/scan",
        label: "Scan QR",
        icon: "ScanLine",
        permission: "shipment.scan",
      },
      {
        href: "/app/pickup-queue",
        label: "Pickup Queue",
        icon: "Truck",
        permission: "shipment.release",
      },
      {
        href: "/app/search",
        label: "Search Cargo",
        icon: "Package",
        permission: "shipment.view",
      },
    ],
  },
  {
    title: "Floor",
    items: [
      {
        href: "/app/receive",
        label: "Receiving Dock",
        icon: "PackagePlus",
        permission: "batch.receive",
      },
      {
        href: "/app/exceptions",
        // Named for what the desk does there rather than the database word:
        // it is where flagged cargo is chased until it is found or written off.
        label: "Investigation Hub",
        icon: "TriangleAlert",
        permission: "exception.raise",
      },
      {
        href: "/app/inventory",
        label: "Warehouse Inventory",
        icon: "Boxes",
        permission: "inventory.view",
      },
      {
        href: "/app/deliveries",
        label: "Delivery History",
        icon: "History",
        permission: "delivery.history",
      },
    ],
  },
  {
    // No profile entry: the name and photo at the foot of the sidebar are
    // already a link to it. Listing it twice spends a row on a destination
    // that is never more than one click away.
    title: "Record",
    items: [
      {
        href: "/app/reports",
        label: "Reports",
        icon: "ChartNoAxesCombined",
        permission: "warehouse.reports",
      },
    ],
  },

];

/**
 * Menus that are a department's own shape rather than a subset of the shared
 * one. Everyone absent from this table gets SECTIONS, filtered.
 */
const ROLE_SECTIONS: Partial<Record<Role, NavSection[]>> = {
  DAR_WAREHOUSE: DAR_SECTIONS,
};

/** Drops every item and every empty section the role cannot reach. */
export function navForRole(role: Role): NavSection[] {
  const sections = ROLE_SECTIONS[role] ?? SECTIONS;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || can(role, item.permission)
      ),
    }))
    .filter((section) => section.items.length > 0);
}
