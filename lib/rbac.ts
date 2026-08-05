import type { Role } from "@prisma/client";

/**
 * Permission model.
 *
 * Roles are coarse (four departments); permissions are fine. Every server
 * action and every page guard asks for a *permission*, never a role — so
 * adding a fifth department later is a table edit, not a refactor.
 */
export type Permission =
  // Shipments
  | "shipment.view"
  | "shipment.create"
  | "shipment.edit"
  | "shipment.depart"
  | "shipment.cancel"
  /// Soft delete: the record leaves every normal view but keeps its photos,
  /// its packages and its history. A warehouse fixes its own mistakes with
  /// this. Erasing a record for good is `shipment.purge`, and only the CEO
  /// holds that.
  | "shipment.delete"
  | "shipment.purge"
  | "shipment.viewInternal" // internal notes, cost inputs, staff names
  | "shipment.scan" // holds physical cargo and reads its label
  /// Produce the label sticker, and see the code that is printed on it.
  ///
  /// The sticker is made once, in Guangzhou, and travels on the box. Every desk
  /// after that reads it — Dar scans it, Finance quotes the number off it — and
  /// none of them has any reason to make another one. A second sticker for the
  /// same cargo, printed in Dar because a label was scuffed, is two identities
  /// for one box and exactly how a piece goes missing on paper while sitting on
  /// the shelf. Reprints are China's to issue.
  | "label.print"
  // Batches
  | "batch.view"
  | "batch.create"
  | "batch.manage" // add/remove shipments, seal, record flight
  | "batch.receive" // mark arrived in Dar
  | "batch.verify" // tick shipments off the manifest
  // Exceptions / investigations
  /// Read the Investigation Hub and the cases in it. Every department holds
  /// this, because a case is never one department's business: Dar found the
  /// problem, China packed the box, Support is on the phone to the customer,
  /// Finance may owe them money. Looking is separate from doing — what each
  /// desk may actually *do* to a case is the five permissions below.
  | "exception.view"
  | "exception.raise"
  | "exception.resolve"
  /// Work a case: move it along the lifecycle, add notes and evidence, assign
  /// it, mark cargo found. Everything that is not money and not final.
  | "exception.investigate"
  /// Record what was actually paid out, and attach the payment evidence.
  /// Finance's hand on the till — never the warehouse's.
  | "exception.compensate"
  /// Say yes to a payout or a replacement. The decision, not the payment:
  /// separated so that nobody both approves an amount and pays it.
  | "exception.approve"
  /// Finish a case for good.
  | "exception.close"
  // Finance
  | "finance.view"
  | "invoice.manage"
  | "invoice.edit" // change a bill before the customer has paid anything
  | "invoice.discount"
  | "invoice.send"
  | "payment.record"
  /// Read a pickup note and print it. Separate from issuing it, because the
  /// two are different authorities: issuing is the act of saying the bill is
  /// settled and the cargo may go, and only Finance does that. Printing the
  /// note Finance already issued is a courtesy anyone at the counter can do.
  | "pickupNote.view"
  | "pickupNote.issue"
  | "pickupNote.cancel"
  | "fx.manage" // publish the USD→TZS rate
  // Delivery
  | "shipment.release"
  | "delivery.history" // cargo already handed over — the Dar release log
  // Dar warehouse floor
  | "inventory.view" // cargo physically held at the Dar warehouse
  | "warehouse.reports" // Dar-scoped throughput/exception reporting
  // Customers
  | "customer.view"
  | "customer.manage"
  // Support desk
  | "ticket.manage"
  | "sourcing.manage"
  | "message.send"
  // Administration
  | "user.manage"
  /**
   * Read the rate book, the exchange rate and the product catalogue.
   *
   * Support answers "what will this cost" all day and needs the same numbers
   * Finance bills from — but reading a price and setting one are different
   * authorities, and the owner's split puts only the reading on this desk.
   */
  | "pricing.view"
  /**
   * Change what the business charges: rates, tiers, products, categories.
   *
   * Held by Finance and the CEO. This was CEO-only until the owner moved
   * pricing into the Finance portal — the point of that page is that a price
   * change tomorrow needs Finance, not a developer and not the CEO.
   */
  | "pricing.manage"
  | "audit.view"
  | "report.view";

const CHINA: Permission[] = [
  "shipment.view",
  "shipment.create",
  "shipment.edit",
  // The desk that took the cargo in is the desk that mistyped the weight. Both
  // are limited to cargo still sitting in China — once it is on a plane the
  // record has been invoiced against and printed onto a manifest.
  "shipment.delete",
  "shipment.depart",
  "shipment.viewInternal",
  // The desk that packs the box is the desk that labels it, and the only one
  // that reprints a damaged sticker.
  "label.print",
  "batch.view",
  "batch.create",
  "batch.manage",
  "customer.view",
  "customer.manage",
  // Reads the Investigation Hub, and nothing more. When Dar reports a box
  // missing, the question that follows is "was it loaded in Guangzhou?" —
  // which only this desk can answer, and cannot answer if it cannot see the
  // case. Absent: raise, investigate, compensate, approve, close. China does
  // not flag cargo it has already handed to an airline, and does not close a
  // case against its own packing.
  "exception.view",
];

/**
 * Dar warehouse — the desk that receives cargo in Tanzania and hands it over.
 *
 * Its authority starts when the plane lands. It reads the China registration,
 * checks the boxes against it, stores them, and releases them once Finance says
 * the bill is settled. It never writes the China record and never touches money.
 *
 * Deliberately absent, and each for a reason:
 *
 * `shipment.edit` / `shipment.delete` — both are gated on the cargo still being
 * READY_TO_DEPART, which means "still sitting in the China warehouse". Granting
 * them to Dar does not give Dar a way to correct cargo it is holding; it gives
 * Dar a way to rewrite and soft-delete China's cargo that has not flown yet —
 * exactly the thing the spec forbids. A weight or count that disagrees with the
 * manifest is raised as an exception (`exception.raise`), which is a record of
 * the disagreement, not a silent overwrite of it.
 *
 * Also absent: shipment.create, batch.create, batch.manage (batches are China's
 * and management's), and every finance/invoice/payment permission — Finance
 * confirms payment and issues the pickup note, Dar only scans it.
 */
const DAR: Permission[] = [
  "shipment.view",
  "shipment.viewInternal",
  "shipment.scan",
  // Batch data is readable because a shipment names its batch and flight; there
  // is no batch.create / batch.manage here, so there is no way in to managing
  // one.
  "batch.view",
  "batch.receive",
  "batch.verify",
  "exception.view",
  "exception.raise",
  "exception.resolve",
  // Dar works the investigation: reports missing, uploads damage evidence,
  // writes notes, marks cargo found. The owner's CANNOT list is what is absent
  // here — no exception.compensate, no exception.approve, no exception.close.
  // The floor that lost the box does not get to decide what it was worth, and
  // does not get to declare the matter finished.
  "exception.investigate",
  // The desk that physically solves the problem is the desk that records what
  // happened — the owner's spec puts the resolution in the hands of whoever
  // found the box or agreed the damage. The CANNOT list bars Dar from closing
  // *compensation* cases specifically, and that is enforced in the action
  // rather than here: a permission cannot see whether a payout is attached.
  "exception.close",
  "shipment.release",
  "inventory.view",
  "delivery.history",
  "warehouse.reports",
  "customer.view",
];

/**
 * Customer Support — the department that talks to customers.
 *
 * Built from the spec's two lists, and the CANNOT list is the load-bearing one.
 * Support sees everything about a shipment and can bill for it, but cannot
 * touch the cargo or the cash: no registering, no weighing, no status changes,
 * no receiving, no releasing, no recording payments, no pickup notes, no
 * batches. Those stay with the warehouses and Finance.
 *
 * Note what is deliberately absent: payment.record, pickupNote.issue,
 * shipment.create, shipment.edit, shipment.release, batch.create,
 * batch.manage, batch.receive, batch.verify, shipment.cancel.
 */
const CUSTOMER_CARE: Permission[] = [
  "shipment.view",
  // Needed to answer "is my cargo damaged" from the receiving photos and the
  // status history — which is the whole point of the desk existing.
  "shipment.viewInternal",
  "batch.view",
  "finance.view",
  "invoice.manage",
  "invoice.edit",
  // Reads and prints the note Finance issued, so a customer at the counter is
  // not sent away to find somebody from Finance. It cannot issue one — that is
  // pickupNote.issue, and it means "the bill is settled and the cargo may go".
  "pickupNote.view",
  // Reads the rate book to answer "what will this cost". Cannot change it,
  // and cannot touch the exchange rate — both are pricing.manage / fx.manage,
  // and neither is here.
  "pricing.view",
  "invoice.send",
  "message.send",
  "ticket.manage",
  "sourcing.manage",
  "customer.view",
  "customer.manage",
  "exception.view",
  "exception.raise",
  // The desk that phones the customer while their cargo is being looked for.
  // It monitors cases and writes the communication notes; it never touches the
  // payout — no exception.compensate, no exception.approve, no exception.close.
  "exception.investigate",
];

const FINANCE: Permission[] = [
  "shipment.view",
  "shipment.viewInternal",
  // No shipment.scan. Scanning is a warehouse action — somebody standing in
  // front of a box, reading the sticker on it. Finance never has the cargo in
  // their hands; they work from the tracking number a customer reads out, and
  // Search Cargo answers that with the same record.
  "batch.view",
  "finance.view",
  "invoice.manage",
  "invoice.edit",
  "invoice.discount",
  "invoice.send",
  "message.send",
  "payment.record",
  "pickupNote.view",
  "pickupNote.issue",
  "pickupNote.cancel",
  // Finance quotes shillings all day, so Finance keeps the rate current. The
  // rate book — what a kilo costs — stays with the CEO.
  "fx.manage",
  "customer.view",
  "customer.manage",
  // The Pricing & Configuration centre. Finance owns what the business
  // charges — the whole reason that page exists is that a price change does
  // not need a developer.
  "pricing.view",
  "pricing.manage",
  "exception.view",
  "exception.raise",
  // Records the payout and attaches the evidence for it. Notably absent:
  // exception.approve — Finance pays what the CEO approved, so the amount is
  // never decided and disbursed by the same desk.
  "exception.compensate",
  "report.view",
];

/** The CEO sees and can do everything — but is never required to. */
const ALL: Permission[] = Array.from(
  new Set<Permission>([
    ...CHINA,
    ...DAR,
    ...FINANCE,
    ...CUSTOMER_CARE,
    "shipment.cancel",
    // Erasing a record for good. Nobody else has it, at any rank.
    "shipment.purge",
    // Approving a payout or a replacement, and declaring a case finished.
    // Held by nobody else — including the Dar floor, which the owner's CANNOT
    // list bars from closing compensation cases. Rather than try to tell a
    // money case from a cargo case at the permission layer, no case is closed
    // by the warehouse at all; Dar drives one to CARGO_FOUND or hands it over,
    // and the CEO signs it off. If the owner later wants Dar to close its own
    // no-money cases, that is one line: add "exception.close" to DAR and gate
    // the close action on the case having no Compensation row.
    "exception.approve",
    "exception.close",
    "user.manage",
    "pricing.manage",
    "audit.view",
    "report.view",
  ])
);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  CHINA_WAREHOUSE: CHINA,
  DAR_WAREHOUSE: DAR,
  FINANCE,
  CUSTOMER_CARE,
};

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role | undefined | null, permissions: Permission[]) {
  return permissions.some((p) => can(role, p));
}

/**
 * Route guard table, evaluated longest-prefix-first in middleware and again in
 * the layout. Anything under /app not listed here needs only a valid session.
 *
 * Listed longest-prefix-first for reading; `permissionForPath` sorts anyway, so
 * a misplaced row cannot open a hole.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/app/scan", permission: "shipment.scan" },
  { prefix: "/app/cargo/new", permission: "shipment.create" },
  { prefix: "/app/batches/new", permission: "batch.create" },
  { prefix: "/app/receive", permission: "batch.receive" },
  { prefix: "/app/release", permission: "shipment.release" },
  // The Investigation Hub and every case detail page under it. Read access is
  // its own permission, held by all five departments, because a case concerns
  // all of them at once. What each may *do* to a case is gated action by
  // action on raise / investigate / compensate / approve / close — so China
  // and a read-only visitor reach the same page and are offered nothing on it.
  { prefix: "/app/exceptions", permission: "exception.view" },
  // The Dar warehouse floor. The arrivals board and the verification bench
  // belong to the desk that receives, so they carry the receiving permissions
  // rather than a new one each.
  { prefix: "/app/incoming", permission: "batch.receive" },
  { prefix: "/app/verification", permission: "batch.verify" },
  { prefix: "/app/inventory", permission: "inventory.view" },
  // Who may collect today is the same authority as handing it over.
  { prefix: "/app/pickup-queue", permission: "shipment.release" },
  // Finding a box is a read; every desk that may see a shipment may look one up.
  { prefix: "/app/search", permission: "shipment.view" },
  { prefix: "/app/deliveries", permission: "delivery.history" },
  // Distinct from /app/admin/reports (report.view): this one is the warehouse's
  // own throughput, not the company's numbers.
  { prefix: "/app/reports", permission: "warehouse.reports" },
  { prefix: "/app/support/sourcing", permission: "sourcing.manage" },
  { prefix: "/app/support", permission: "ticket.manage" },
  { prefix: "/app/finance/exchange-rate", permission: "fx.manage" },
  // NOTE: there is deliberately no /app/finance/compensation row. A guard for
  // it lived here for months over a page that was never built — harmless, in
  // that an absent route cannot be entered, but this table is the one place
  // people read to answer "who can reach what", and a promise about a
  // nonexistent door makes the honest rows harder to trust. Compensation is
  // decided in the Investigation Hub, where the case is; in Finance it appears
  // as a ledger line, not a screen.
  //
  // Ahead of /app/finance because finance.view is also held by Customer Care:
  // the pickup-note register is reachable by Support, which holds finance.view
  // but must not be admitted by it alone.
  { prefix: "/app/finance/pickup-notes", permission: "pickupNote.view" },
  // Reading the rate book is pricing.view; every mutation on that page is
  // separately gated on pricing.manage or fx.manage in its own action.
  { prefix: "/app/finance/pricing", permission: "pricing.view" },
  { prefix: "/app/finance", permission: "finance.view" },
  { prefix: "/app/admin/deleted", permission: "shipment.cancel" },
  { prefix: "/app/admin/pricing", permission: "pricing.manage" },
  { prefix: "/app/admin/markets", permission: "pricing.manage" },
  { prefix: "/app/admin/users", permission: "user.manage" },
  { prefix: "/app/admin/audit", permission: "audit.view" },
  { prefix: "/app/admin", permission: "report.view" },
  { prefix: "/app/customers", permission: "customer.view" },
  { prefix: "/app/shipments", permission: "batch.view" },
  { prefix: "/app/batches", permission: "batch.view" },
  { prefix: "/app/cargo", permission: "shipment.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.filter((r) =>
    pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.permission ?? null;
}

/**
 * Where every role lands after login. The dashboard itself renders the right
 * department view, so there is a single post-login destination.
 */
export const POST_LOGIN_PATH = "/app/dashboard";
