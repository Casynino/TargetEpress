/**
 * WHERE THE READER WALKED, NOT WHAT THE RECORD BELONGS TO.
 *
 * A detail page has two different notions of "up" and this app was confusing
 * them. Cargo BELONGS to a batch — an operational fact, and why the cargo page's
 * back link said "GZ-0001". But a clerk who opened that consignment from the
 * payment follow-up list did not come from GZ-0001 and does not want to go
 * there; they want the call list they were working down, with its tab, its
 * filter and its search still set. Relationship is not navigation, and using one
 * as the other loses people several times a day.
 *
 * So the app keeps its own stack of where the reader has actually been. One
 * component watches the address and maintains it; every back control reads it.
 * That is why this is not per-link plumbing: there are about a hundred and
 * eighty links into detail pages in this codebase and any of them that got
 * missed would be a screen that still teleports.
 *
 * NOT BROWSER HISTORY. `router.back()` cannot tell a page the reader walked to
 * from one the app redirected through, it counts a filter change as a step, and
 * in the WeChat webview the Guangzhou desk lives in there is frequently no
 * history at all — that is the bug that once left a colleague signing out to
 * change screens. This is an explicit record of the workflow, kept per tab.
 *
 * A LIST RESETS IT. Opening the customer book is the start of a piece of work,
 * not a step deeper into the last one, so arriving at any list truncates the
 * stack to itself. Arriving at somewhere already ON the stack truncates back to
 * it, so walking back the way you came does not grow it.
 */

const KEY = "tx.nav.trail";

/** More levels than any real workflow, and a ceiling on what is stored. */
const MAX = 8;

/**
 * Pages you open a record FROM. Everything under one of these, one segment
 * deeper, is a record — except the static leaves below, which are their own
 * screens rather than a thing being looked at.
 */
const DETAIL_PARENTS = [
  "/app/cargo/",
  "/app/batches/",
  "/app/shipments/",
  "/app/customers/",
  "/app/receive/",
  "/app/finance/invoices/",
  "/app/finance/payments/",
  "/app/finance/transactions/",
  "/app/finance/accounts/",
  "/app/finance/pickup-notes/",
  "/app/finance/receipts/",
  "/app/collections/record/",
  "/app/support/tickets/",
  "/app/support/sourcing/",
  "/app/exceptions/",
  "/app/admin/users/",
  "/app/manager/batches/",
];

/** Segments that are a screen of their own, not a record's id. */
const STATIC_LEAVES = new Set(["new", "verify", "pending", "submissions", "follow-up"]);

export function isDetailPath(path: string): boolean {
  const clean = path.split("?")[0];
  const parent = DETAIL_PARENTS.find((prefix) => clean.startsWith(prefix));
  if (!parent) return false;
  const rest = clean.slice(parent.length).split("/")[0];
  return rest.length > 0 && !STATIC_LEAVES.has(rest);
}

/** Only our own pages: a stored value is a redirect target. */
function isOurs(url: string): boolean {
  return (
    typeof url === "string" &&
    url.startsWith("/app/") &&
    !url.startsWith("/app//") &&
    !url.includes("\\") &&
    url.length < 512
  );
}

function samePage(a: string, b: string): boolean {
  return a.split("?")[0] === b.split("?")[0];
}

export function readTrail(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOurs).slice(-MAX) : [];
  } catch {
    /* Private browsing, a cleared store, a quota. Navigation must not break
       because a convenience could not be read. */
    return [];
  }
}

function write(trail: string[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    /* Same: better a back button that falls back than a page that throws. */
  }
}

/**
 * Record that the reader is now here, and return the stack.
 *
 * Three cases, in order:
 *   - already on the stack — they walked back, so truncate to it;
 *   - a list — a new piece of work, so the stack becomes just this;
 *   - a record — one step deeper, so push.
 */
export function visit(url: string): string[] {
  if (typeof window === "undefined" || !isOurs(url)) return [];
  const trail = readTrail();

  const at = trail.findIndex((entry) => samePage(entry, url));
  if (at >= 0) {
    const next = trail.slice(0, at + 1);
    /* Keep the address they actually arrived at, filters and all. */
    next[at] = url;
    write(next);
    return next;
  }

  const next = isDetailPath(url) ? [...trail, url] : [url];
  write(next);
  return next;
}

/** The page before this one, or null when this is where the work started. */
export function previous(trail: string[]): string | null {
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}

/** What every list in this app is called, longest prefix first. */
const NAMES: { prefix: string; label: string }[] = [
  { prefix: "/app/collections/follow-up", label: "Payment follow-up" },
  { prefix: "/app/collections/submissions", label: "Payment history" },
  { prefix: "/app/collections/verify", label: "Verify payments" },
  { prefix: "/app/collections", label: "Collections" },
  { prefix: "/app/finance/payments/new", label: "Merge Payment" },
  { prefix: "/app/finance/payments", label: "Payments" },
  { prefix: "/app/finance/transactions", label: "The Ledger" },
  { prefix: "/app/finance/invoices", label: "Bills" },
  { prefix: "/app/finance/pickup-notes", label: "Pickup notes" },
  { prefix: "/app/finance/expenses", label: "Expenses" },
  { prefix: "/app/finance/accounts", label: "Accounts" },
  { prefix: "/app/finance/credit", label: "Credit" },
  { prefix: "/app/finance/payroll", label: "Payroll" },
  { prefix: "/app/finance/reports", label: "Profit & loss" },
  { prefix: "/app/finance/pricing", label: "Price Configuration" },
  { prefix: "/app/finance/income", label: "Closed batches" },
  { prefix: "/app/finance/audit", label: "Money audit" },
  { prefix: "/app/finance", label: "Finance" },
  { prefix: "/app/manager/reconciliation", label: "Reconciliation" },
  { prefix: "/app/manager/finance", label: "Money" },
  { prefix: "/app/manager/batches", label: "Flights" },
  { prefix: "/app/manager/approvals", label: "Approvals" },
  { prefix: "/app/manager/operations", label: "Operations" },
  { prefix: "/app/manager/reports", label: "Reports" },
  { prefix: "/app/manager/control", label: "Control room" },
  { prefix: "/app/manager", label: "Command centre" },
  { prefix: "/app/shipments", label: "Arrived batches" },
  { prefix: "/app/batches", label: "Loading batches" },
  { prefix: "/app/cargo/new", label: "Register cargo" },
  { prefix: "/app/cargo", label: "Cargo" },
  { prefix: "/app/customers", label: "Customers" },
  { prefix: "/app/support/tickets", label: "Tickets" },
  { prefix: "/app/support/sourcing", label: "Sourcing requests" },
  { prefix: "/app/support", label: "Support" },
  { prefix: "/app/exceptions", label: "Issues & Claims" },
  { prefix: "/app/admin/users", label: "Staff" },
  { prefix: "/app/admin/deleted", label: "Deleted records" },
  { prefix: "/app/admin/audit", label: "Audit log" },
  { prefix: "/app/admin/markets", label: "Markets" },
  { prefix: "/app/admin/settings", label: "Settings" },
  { prefix: "/app/admin", label: "Administration" },
  { prefix: "/app/pickup-queue", label: "Pickup queue" },
  { prefix: "/app/inventory", label: "In the warehouse" },
  { prefix: "/app/deliveries", label: "Deliveries" },
  { prefix: "/app/incoming", label: "Incoming" },
  { prefix: "/app/requests", label: "Requests" },
  { prefix: "/app/receive", label: "Receive" },
  { prefix: "/app/release", label: "Release" },
  { prefix: "/app/search", label: "Search" },
  { prefix: "/app/scan", label: "Scan" },
  { prefix: "/app/reports", label: "Reports" },
  { prefix: "/app/activity", label: "Activity" },
  { prefix: "/app/notifications", label: "Notifications" },
  { prefix: "/app/profile", label: "Profile" },
  { prefix: "/app/dashboard", label: "Home" },
];

export function labelForPath(path: string): string | null {
  const clean = path.split("?")[0];
  return NAMES.find((row) => clean.startsWith(row.prefix))?.label ?? null;
}
