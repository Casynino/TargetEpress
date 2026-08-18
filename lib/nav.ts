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
  /**
   * Extra paths this row owns.
   *
   * For pages that belong to a section but do not live under its path — the
   * operational Reports page sits at /app/admin/reports and is reached from
   * inside the General ledger. Without this the sidebar highlights nothing
   * while you are plainly somewhere, which reads as a bug.
   */
  alsoMatches?: string[];
};

export type NavSection = {
  /** Used as a React key and to reason about the file. */
  title: string;
  /**
   * Render the section as a named group: an icon and a heading, with its rows
   * indented beneath.
   *
   * Off by default, and it should stay off for short menus — "OVERVIEW" above
   * two links tells nobody anything, and spacing separates them perfectly
   * well. It earns its place once a desk has fourteen rows, where a flat list
   * is a wall and the eye has nothing to aim at.
   */
  group?: { label: string; icon: string };
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
      { href: "/app/dashboard", label: "Home", icon: "LayoutDashboard", exact: true },
      // The standalone cargo list is deliberately absent. A mixed list of every
      // piece of cargo in the business tells you nothing about which shipment
      // it is on or where it is; cargo is reached from inside a batch, where
      // it has context. The routes still exist so QR labels and
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
        label: "Arrived batches",
        icon: "PlaneTakeoff",
        permission: "batch.view",
      },
      {
        href: "/app/batches",
        label: "Loading batches",
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
        href: "/app/search",
        label: "Search",
        icon: "Package",
        // How every desk that is not holding the box finds one: a customer
        // reads out a tracking number, or a name, or a phone number. Finance
        // and Support live on this — they never have the cargo in their hands.
        permission: "shipment.view",
      },
      {
        href: "/app/finance/pickup-notes",
        label: "Pickup notes",
        icon: "QrCode",
        // Beside Search rather than inside Finance, because a pickup note
        // is an operational document, not a financial one. Finance issues it,
        // but the people reaching for it all day are at the counter with a
        // customer in front of them — and the counter is what this section is.
        //
        // Read, not issue: Support prints these and needs the door.
        permission: "pickupNote.view",
      },
      {
        href: "/app/receive",
        label: "Receive & verify",
        icon: "ClipboardCheck",
        permission: "batch.receive",
      },
      {
        href: "/app/release",
        // "Scan & release", not two entries.
        //
        // There was a "Scan QR" door and a "Release cargo" door, and they now
        // open the same room: a scan lands on the release screen and finishes
        // there. Naming it for both halves is what stops a clerk hunting for
        // the scanner — the same two roles hold both permissions, so nobody
        // sees this who cannot do either.
        label: "Scan & release",
        icon: "ScanLine",
        permission: "shipment.release",
      },
      {
        href: "/app/exceptions",
        // Named for what the desk does there rather than for the database word:
        // it is where flagged cargo is chased until it is found or written off.
        // One name in every department's sidebar — staff ring each other about
        // this page, and two names for it is one misunderstanding a day.
        label: "Issues & Claims",
        icon: "TriangleAlert",
        // Read, not raise. China holds only this one and belongs here: it is
        // the desk that can say whether a missing box was ever loaded.
        permission: "exception.view",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      // Two rows, and only two. Chasing the money and recording it are
      // different jobs done at different times of day, and each is a workspace
      // with its own tabs — so each gets a door, and neither gets a door per
      // screen inside it.
      //
      // Collections was reachable only from the support desk's sidebar, which
      // meant Finance — who chase more of these than Support do — had the
      // permission (collections.view) and no way in. Their links to the chase
      // list all landed on "That area is not yours".
      {
        href: "/app/collections/follow-up",
        label: "Collections",
        icon: "Banknote",
        permission: "collections.view",
      },
      /*
        Credit, with its own door.

        It was built with only the Finance tab row to reach it, which meant the
        page existed and nobody could find it: you had to already be inside
        Finance and notice a tab. Exactly the mistake the Collections row above
        was added to fix, made again one release later.

        Beside Collections rather than under Finance because it is the same
        afternoon's work — chasing an overdue credit and chasing an unpaid bill
        are one job — and on credit.view, which Support holds too.
      */
      {
        href: "/app/finance/credit",
        label: "Credit",
        icon: "CalendarClock",
        permission: "credit.view",
      },
      // Deliberately not `exact`, so the row stays lit on every screen inside
      // Finance. Which of them you are on is the tab row's job — it is right
      // above the numbers, where somebody moving between them is already
      // looking.
      //
      // No Invoices row here. An invoice belongs to the cargo it bills and is
      // opened from there or from the dispatch — a list of invoice numbers on
      // its own says nothing about which box it is or where.
      {
        href: "/app/finance",
        // Named for what the page IS. "General ledger" now belongs to the tab
        // that holds every movement — this door opens onto the department at a
        // glance, and calling both by the same words sent people to the wrong
        // one to look up a transaction.
        label: "Overview",
        icon: "Wallet",
        permission: "accounting.view",
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
        href: "/app/collections/follow-up",
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
        href: "/app/admin/settings",
        label: "Company settings",
        icon: "SlidersHorizontal",
        // The accounts customers pay into and the offices they collect from.
        // The owner's alone — see settings.manage.
        permission: "settings.manage",
      },
      // No Reports row here. It is a tab inside the General ledger, beside
      // Profit & loss — the two answer the same question from different ends
      // (what the business did, and what it earned doing it), and splitting
      // them across the sidebar and a tab row meant nobody could find both.
      //
      // No Products & pricing row here either. The rate book moved into the Finance
      // portal, where the desk that owns it works — and the CEO reaches the
      // same page from the same place rather than a second copy in Management.
      {
        href: "/app/admin/markets",
        label: "China markets",
        icon: "Store",
        // settings.manage, not pricing.manage. The directory is company
        // content — what we tell customers about Yiwu and Huaqiangbei — and it
        // only ever carried the pricing permission because that was the
        // nearest one to hand. Finance holds pricing.manage because Finance
        // owns the rate book, so the accident put the CEO's marketing copy in
        // the finance sidebar with Edit and Delete buttons on it.
        //
        // Support still reads the same directory at /app/support/markets under
        // sourcing.manage; only editing narrows.
        permission: "settings.manage",
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
 * to that floor, "Arrived batches" is everything ever flown when what they want is
 * what is landing this week, and "Batches" is a door into work that is China's.
 * The floor works a line — arrivals, receive, verify, store, hand over — so the
 * menu is that line, in that order.
 *
 * Every item still declares its permission and is still filtered below, so this
 * is a different arrangement of the same gates, never a way around them.
 */
/**
 * The Dar floor's menu, grouped the way the desk is organised.
 *
 * Same shape as the money desk and the support desk: Home on its own, the work
 * in the kinds it comes in, and the record at the bottom outside any heading.
 *
 * The two ways in — Scan and Search — lead the Batches group rather than
 * sitting under "handover". They are not a stage of the work; they are how
 * every job on this floor starts. A box arrives and somebody reads its label; a
 * customer rings and somebody looks the number up.
 *
 * Every row already existed and every permission is unchanged. This is the same
 * menu re-shelved, not a new set of doors.
 */
const DAR_SECTIONS: NavSection[] = [
  {
    title: "Top",
    items: [
      {
        href: "/app/dashboard",
        label: "Home",
        icon: "LayoutDashboard",
        exact: true,
      },
    ],
  },
  {
    title: "Batches",
    group: { label: "Batches", icon: "Boxes" },
    items: [
      {
        href: "/app/search",
        label: "Search",
        icon: "Package",
        permission: "shipment.view",
      },
      {
        href: "/app/release",
        label: "Scan & release",
        icon: "ScanLine",
        permission: "shipment.release",
      },
      {
        href: "/app/pickup-queue",
        label: "Pickup Queue",
        icon: "Truck",
        permission: "shipment.release",
      },
      {
        href: "/app/receive",
        label: "Receiving Dock",
        icon: "PackagePlus",
        permission: "batch.receive",
      },
    ],
  },
  {
    title: "Warehouse",
    group: { label: "Warehouse", icon: "Warehouse" },
    items: [
      {
        href: "/app/inventory",
        label: "Available Cargo",
        icon: "Boxes",
        permission: "inventory.view",
      },
      {
        href: "/app/deliveries",
        label: "Collected Cargo",
        icon: "History",
        permission: "delivery.history",
      },
    ],
  },
  {
    title: "Support",
    group: { label: "Support", icon: "MessageSquare" },
    items: [
      {
        href: "/app/exceptions",
        // Named for what the desk does there rather than the database word:
        // it is where flagged cargo is chased until it is found or written off.
        label: "Issues & Claims",
        icon: "TriangleAlert",
        permission: "exception.view",
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
/**
 * The support desk's menu, grouped.
 *
 * Their fourteen rows were a flat column ordered for the desks that move
 * cargo, so the page they open every morning sat seventh. Grouped, the shape
 * of the job is visible before a single label is read: three rows they use
 * constantly at the top, then the work in the four kinds it comes in, then
 * the ledger.
 *
 * Every row here already existed and every permission is unchanged — this is
 * the same menu re-shelved, not a new set of doors.
 */
const SUPPORT_SECTIONS: NavSection[] = [
  {
    title: "Top",
    items: [
      // "Home", not "Support Home" — this sidebar renders only for the support
      // desk, so the qualifier restated where the person already is.
      { href: "/app/support", label: "Home", icon: "Headset", exact: true },
      { href: "/app/search", label: "Search", icon: "Package" },
      { href: "/app/customers", label: "Customers", icon: "Users" },
    ],
  },
  {
    title: "Cargo",
    group: { label: "Batches", icon: "Boxes" },
    items: [
      { href: "/app/shipments", label: "Arrived batches", icon: "PlaneTakeoff" },
      { href: "/app/batches", label: "Loading batches", icon: "Boxes" },
    ],
  },
  {
    title: "Billing",
    // Everything this desk does about money, in the order the job runs:
    // collect it, chase what has not come, hand over the cargo once it has,
    // and look up what a thing costs when a customer asks.
    //
    // Collections is ONE row inside it, not four. The workspace carries its
    // own tabs — the call list, what is with Finance, what was verified — and
    // repeating those down the side is the same navigation twice.
    group: { label: "Billing", icon: "ReceiptText" },
    items: [
      /* Credit leads the billing group on this desk. It is the list that decides
         whether a customer's cargo can leave the building at all, so it is read
         before the chase list rather than after it. */
      { href: "/app/finance/credit", label: "Credit", icon: "CalendarClock" },
      { href: "/app/collections/follow-up", label: "Collections", icon: "Banknote" },
      { href: "/app/finance/pickup-notes", label: "Pickup notes", icon: "QrCode" },
      // Read-only for this desk: they quote from the rate book and answer
      // "what will this cost", they do not set it. pricing.manage is Finance's.
      { href: "/app/finance/pricing", label: "Price Configuration", icon: "Tags" },
    ],
  },
  {
    title: "Support",
    group: { label: "Customer Support", icon: "MessageSquare" },
    items: [
      { href: "/app/support/tickets", label: "Tickets", icon: "MessageSquare" },
      { href: "/app/exceptions", label: "Issues & Claims", icon: "TriangleAlert" },
    ],
  },
  {
    title: "China",
    group: { label: "China Services", icon: "Store" },
    items: [
      { href: "/app/support/sourcing", label: "Sourcing requests", icon: "ShoppingBag" },
      { href: "/app/support/markets", label: "China markets", icon: "Store" },
    ],
  },
];

/**
 * Finance's menu, grouped the way the desk is organised.
 *
 * They were on the shared menu, which is ordered for the desks that move
 * cargo: the batch boards came first and the two screens Finance actually
 * lives in — Collections and the ledger — sat eighth and ninth. Grouped, the
 * money is at the top where the job starts, and the cargo rows are still there
 * for the half of the day spent answering "which box is this".
 *
 * Home and the audit log stand outside the groups on purpose. Home is where
 * you start and the log is where you go to settle an argument; neither belongs
 * under a heading, and a group of one is heavier than the row inside it.
 *
 * Every row already existed and every permission is declared and unchanged —
 * this is the same menu re-shelved, not a new set of doors. The permissions are
 * spelled out rather than assumed: this menu renders only for Finance today,
 * and if that role ever narrows the sidebar should narrow with it rather than
 * offering a door that refuses.
 */
const FINANCE_SECTIONS: NavSection[] = [
  {
    title: "Top",
    items: [
      { href: "/app/dashboard", label: "Home", icon: "LayoutDashboard", exact: true },
    ],
  },
  {
    // Batches lead this menu, above the money.
    //
    // Finance opens a batch to answer a money question — what GZ-0028 made,
    // what is still owed on it — so the batch is the thing being looked up and
    // the finance screens are what gets done about it.
    title: "Batches",
    group: { label: "Batches", icon: "Boxes" },
    items: [
      {
        href: "/app/shipments",
        label: "Arrived batches",
        icon: "PlaneTakeoff",
        permission: "batch.view",
      },
      {
        href: "/app/batches",
        label: "Loading batches",
        icon: "Boxes",
        permission: "batch.view",
      },
    ],
  },
  {
    title: "Finance",
    // The order the day runs in: chase what is owed, record what came in, then
    // release the cargo it paid for.
    group: { label: "Finance", icon: "ReceiptText" },
    items: [
      // The overview leads: it is the department, and Collections is one part
      // of the money passing through it.
      {
        href: "/app/finance",
        label: "Overview",
        icon: "Wallet",
        permission: "accounting.view",
      },
      // Collections is both a row here and a tab inside the General ledger, at
      // the owner's request. That is the one place this navigation keeps two
      // doors into one room: it is opened many times a day, and burying it a
      // click inside the ledger costs more than the duplication does.
      {
        href: "/app/collections/follow-up",
        label: "Collections",
        icon: "Banknote",
        permission: "collections.view",
      },
      {
        /* The credit book. Finance grants the terms, chases the debt and sets
           the limits, so this is its row — beside Collections, because an
           overdue credit and an unpaid bill are one afternoon's work. */
        href: "/app/finance/credit",
        label: "Credit",
        icon: "CalendarClock",
        permission: "credit.view",
      },
      {
        /*
          The rate book, with its own door.

          It used to be reachable only as a tab inside the finance row. That row
          came off the page — it governs every figure the money pages report and
          is opened deliberately, not wandered into — so without a row here the
          desk that sets prices would have had no way in at all.
        */
        href: "/app/finance/pricing",
        label: "Price Configuration",
        icon: "Tags",
        permission: "pricing.view",
      },
      {
        href: "/app/finance/pickup-notes",
        label: "Pickup notes",
        icon: "QrCode",
        permission: "pickupNote.view",
      },
    ],
  },
  {
    title: "Customers",
    // Search before Customers: a customer on the phone reads out a tracking
    // number far more often than Finance goes looking for the person.
    group: { label: "Customers", icon: "Users" },
    items: [
      {
        href: "/app/search",
        label: "Search",
        icon: "Package",
        permission: "shipment.view",
      },
      {
        href: "/app/customers",
        label: "Customers",
        icon: "Users",
        permission: "customer.view",
      },
    ],
  },
  {
    title: "Support",
    group: { label: "Support & Issues", icon: "MessageSquare" },
    items: [
      {
        href: "/app/exceptions",
        label: "Issues & Claims",
        icon: "TriangleAlert",
        permission: "exception.view",
      },
    ],
  },
  {
    title: "Audit",
    items: [
      {
        href: "/app/admin/audit",
        label: "Audit log",
        icon: "History",
        permission: "audit.view",
      },
    ],
  },
];

/**
 * The Guangzhou desk's menu, grouped the way that floor is organised.
 *
 * Same skeleton as Dar, Finance and Support: Home alone, the work in the kinds
 * it comes in, the record at the bottom outside any heading. The contents
 * differ because the jobs do — this desk registers and loads cargo, it never
 * receives or releases any.
 *
 * Every row already existed in the shared menu and every permission is
 * unchanged. Reports is the one addition, and it opens a report written for
 * this floor rather than Dar's.
 */
const CHINA_SECTIONS: NavSection[] = [
  {
    title: "Top",
    items: [
      {
        href: "/app/dashboard",
        label: "Home",
        icon: "LayoutDashboard",
        exact: true,
      },
    ],
  },
  {
    title: "Cargo",
    group: { label: "Cargo", icon: "Boxes" },
    items: [
      {
        href: "/app/search",
        label: "Search",
        icon: "Package",
        permission: "shipment.view",
      },
      {
        href: "/app/requests",
        label: "Requests",
        icon: "Inbox",
        // Bookings and pickups off the website. The desk that registers cargo
        // is the desk that rings these people back.
        permission: "shipment.create",
      },
      {
        href: "/app/cargo/new",
        label: "Receive Cargo",
        icon: "PackagePlus",
        permission: "shipment.create",
      },
    ],
  },
  {
    title: "Batches",
    group: { label: "Batches", icon: "PlaneTakeoff" },
    items: [
      {
        href: "/app/batches",
        label: "Loading batches",
        icon: "Boxes",
        permission: "batch.view",
      },
      {
        href: "/app/shipments",
        label: "Arrived batches",
        icon: "PlaneTakeoff",
        permission: "batch.view",
      },
    ],
  },
  {
    title: "Customers",
    group: { label: "Customers", icon: "Users" },
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
    title: "Support",
    group: { label: "Support", icon: "MessageSquare" },
    items: [
      {
        href: "/app/exceptions",
        label: "Issues & Claims",
        icon: "TriangleAlert",
        permission: "exception.view",
      },
    ],
  },
  {
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
 * The owner's menu, grouped the way the business is.
 *
 * The last role still reading the shared flat list, which had grown to
 * twenty-five rows in five loosely-titled blocks — the longest menu in the app
 * belonging to the person with the least time to hunt through it.
 *
 * Same skeleton as every other desk: Home alone at the top, the work in the
 * kinds it comes in, and the record at the bottom outside any heading. The
 * groups run in the order cargo moves — booked, flown, billed — then the desks
 * that answer for it, then the business itself, then the keys to the building.
 *
 * Every row already existed and every permission is unchanged.
 */
const ADMIN_SECTIONS: NavSection[] = [
  {
    title: "Top",
    items: [
      { href: "/app/dashboard", label: "Home", icon: "LayoutDashboard", exact: true },
    ],
  },
  {
    title: "Cargo operations",
    group: { label: "Cargo operations", icon: "Boxes" },
    items: [
      { href: "/app/search", label: "Search", icon: "Package", permission: "shipment.view" },
      { href: "/app/requests", label: "Requests", icon: "Inbox", permission: "shipment.create" },
      { href: "/app/cargo/new", label: "Receive cargo", icon: "PackagePlus", permission: "shipment.create" },
      { href: "/app/receive", label: "Receive & verify", icon: "ClipboardCheck", permission: "batch.receive" },
    ],
  },
  {
    title: "Batches",
    group: { label: "Batches", icon: "PlaneTakeoff" },
    items: [
      { href: "/app/release", label: "Scan & release", icon: "ScanLine", permission: "shipment.release" },
      { href: "/app/batches", label: "Loading batches", icon: "Boxes", permission: "batch.view" },
      { href: "/app/shipments", label: "Arrived batches", icon: "PlaneTakeoff", permission: "batch.view" },
    ],
  },
  {
    title: "Finance",
    group: { label: "Finance", icon: "ReceiptText" },
    items: [
      { href: "/app/collections/follow-up", label: "Collections", icon: "Banknote", permission: "collections.view" },
      { href: "/app/finance/credit", label: "Credit", icon: "CalendarClock", permission: "credit.view" },
      { href: "/app/finance/pricing", label: "Price Configuration", icon: "Tags", permission: "pricing.view" },
      { href: "/app/finance/pickup-notes", label: "Pickup notes", icon: "QrCode", permission: "pickupNote.view" },
      { href: "/app/finance", label: "Overview", icon: "Wallet", permission: "accounting.view" },
      // collections.view, matching the route's own guard. The shared menu had
      // this on ticket.manage, from when the call list lived under /app/support.
      { href: "/app/collections/follow-up", label: "Payment follow-up", icon: "PhoneCall", permission: "collections.view" },
    ],
  },
  {
    title: "Support",
    group: { label: "Support and issues", icon: "MessageSquare" },
    items: [
      { href: "/app/support/tickets", label: "Tickets", icon: "MessageSquare", permission: "ticket.manage" },
      // "Support home", not "Home" — this menu already has one, and a bare
      // Home here would collide with the owner's own dashboard.
      { href: "/app/support", label: "Support home", icon: "Headset", permission: "ticket.manage", exact: true },
      { href: "/app/exceptions", label: "Issues & Claims", icon: "TriangleAlert", permission: "exception.view" },
    ],
  },
  {
    title: "Customers",
    group: { label: "Customers", icon: "Users" },
    items: [
      { href: "/app/customers", label: "Customers", icon: "Users", permission: "customer.view" },
    ],
  },
  {
    title: "Business",
    group: { label: "Business", icon: "Store" },
    items: [
      // The editor at /app/admin/markets, not the support desk's read view:
      // this is the menu of the person who changes what customers are told.
      { href: "/app/admin/markets", label: "China markets", icon: "Store", permission: "settings.manage" },
      { href: "/app/support/sourcing", label: "Sourcing requests", icon: "ShoppingBag", permission: "sourcing.manage" },
    ],
  },
  {
    title: "Administration",
    group: { label: "Administration", icon: "SlidersHorizontal" },
    items: [
      { href: "/app/admin/users", label: "Staff", icon: "UserCog", permission: "user.manage" },
      { href: "/app/admin/deleted", label: "Deleted records", icon: "Trash2", permission: "shipment.cancel" },
      { href: "/app/admin/settings", label: "Company settings", icon: "SlidersHorizontal", permission: "settings.manage" },
    ],
  },
  {
    // Outside the groups, same as every other desk: the log is where you go to
    // settle an argument, not a kind of work.
    title: "Record",
    items: [
      { href: "/app/admin/audit", label: "Audit log", icon: "History", permission: "audit.view" },
    ],
  },
];


/**
 * The manager's menu: monitoring first, money second, decisions last.
 *
 * Ordered the way the job runs rather than the way the database is shaped —
 * what is moving, what it earned, what is owed, what needs a signature. The
 * owner's own menu is organised around administering the system; this one is
 * organised around running the business, which is a different day.
 *
 * Every row here points at a page that already exists and already computes its
 * figures from the one engine behind it. A manager's portal that recalculated
 * revenue its own way would be a second set of books.
 */
const MANAGER_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/app/manager", label: "Home", icon: "LayoutDashboard", exact: true },
    ],
  },
  {
    title: "Operations",
    group: { label: "Operations", icon: "Boxes" },
    items: [
      { href: "/app/shipments", label: "Arrived batches", icon: "PlaneTakeoff" },
      { href: "/app/batches", label: "Loading batches", icon: "Boxes" },
      { href: "/app/search", label: "Search", icon: "Package" },
      { href: "/app/customers", label: "Customers", icon: "Users" },
      { href: "/app/exceptions", label: "Issues & Claims", icon: "TriangleAlert" },
    ],
  },
  {
    title: "Finance",
    group: { label: "Finance", icon: "ReceiptText" },
    items: [
      { href: "/app/finance", label: "Overview", icon: "Wallet" },
      { href: "/app/finance/transactions", label: "Transactions", icon: "ArrowLeftRight" },
      { href: "/app/collections/follow-up", label: "Collections", icon: "Banknote" },
      { href: "/app/finance/credit", label: "Credit", icon: "CalendarClock" },
      { href: "/app/finance/reports", label: "Profit & loss", icon: "TrendingUp" },
      { href: "/app/manager/reconciliation", label: "Reconciliation", icon: "Scale" },
    ],
  },
  {
    title: "Money out",
    group: { label: "Money out", icon: "Coins" },
    items: [
      { href: "/app/finance/expenses", label: "Expenses", icon: "Receipt" },
      { href: "/app/finance/accounts", label: "Bank & cash", icon: "Landmark" },
    ],
  },
  {
    title: "Decisions",
    group: { label: "Decisions", icon: "BadgeCheck" },
    items: [
      { href: "/app/manager/approvals", label: "Pending approvals", icon: "BadgeCheck" },
    ],
  },
  {
    title: "Oversight",
    group: { label: "Oversight", icon: "History" },
    items: [
      { href: "/app/manager/reports", label: "Management report", icon: "FileText" },
      { href: "/app/finance/audit", label: "Activity log", icon: "History" },
      { href: "/app/admin/deleted", label: "Deleted records", icon: "Trash2" },
    ],
  },
];

const ROLE_SECTIONS: Partial<Record<Role, NavSection[]>> = {
  ADMIN: ADMIN_SECTIONS,
  MANAGER: MANAGER_SECTIONS,
  CHINA_WAREHOUSE: CHINA_SECTIONS,
  DAR_WAREHOUSE: DAR_SECTIONS,
  CUSTOMER_CARE: SUPPORT_SECTIONS,
  FINANCE: FINANCE_SECTIONS,
};

/**
 * Rows that are a second door into a room this role already has one for.
 *
 * Customer Care has "Support home", which is their dashboard — the search box,
 * the call list, the queues. A "Dashboard" row above it pointed at a route
 * that renders nothing for them, so the menu offered an empty room and the
 * real one, in that order.
 */
const REDUNDANT_ROWS: Partial<Record<Role, string[]>> = {
  CUSTOMER_CARE: ["/app/dashboard"],
};

/**
 * Which block of the menu this desk lives in, when it is not the first one.
 *
 * The shared menu is ordered for the desks that move cargo: Work, then
 * Finance, then the Support desk. Read by Customer Care that put their own
 * home seventh, under the General ledger, below five rows about batches and
 * boxes — so the one page they open every morning was the furthest thing from
 * the top. Every other role's home is its first row and theirs should be too.
 *
 * A reorder rather than a menu of their own: the rows they share with everyone
 * else are the same rows, and a second copy of them is a second place to
 * forget to change.
 */
const SECTION_ORDER: Partial<Record<Role, string[]>> = {};

/** Drops every item and every empty section the role cannot reach. */
export function navForRole(role: Role): NavSection[] {
  const sections = ROLE_SECTIONS[role] ?? SECTIONS;
  const hidden = REDUNDANT_ROWS[role] ?? [];
  const order = SECTION_ORDER[role];

  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !hidden.includes(item.href) &&
          (!item.permission || can(role, item.permission))
      ),
    }))
    .filter((section) => section.items.length > 0);

  if (!order) return visible;

  // Anything the list does not name keeps its position after the ones it does,
  // so adding a section later cannot silently vanish from one role's menu.
  return [...visible].sort((a, b) => {
    const rank = (title: string) => {
      const i = order.indexOf(title);
      return i === -1 ? order.length : i;
    };
    return rank(a.title) - rank(b.title);
  });
}
