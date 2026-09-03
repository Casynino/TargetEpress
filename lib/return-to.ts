/**
 * WHERE THE READER CAME FROM, CARRIED IN THE URL.
 *
 * A detail page has two different notions of "up" and the app was conflating
 * them. Cargo BELONGS to a batch — that is an operational fact, and it is why
 * the cargo page's back link said "GZ-0001". But a clerk who opened that
 * consignment from the payment follow-up list did not come from GZ-0001 and
 * does not want to go there; they want the call list they were working down,
 * with its tab, its filter and its search still set. Relationship is not
 * navigation, and using one as the other loses people.
 *
 * So the trail travels with the link. Each list appends its own full address —
 * path AND query, so the tab, the page number, the status filter and the search
 * come back exactly as they were — and each detail page passes the trail on to
 * whatever it opens next. Back is the last entry; back from there is the one
 * before it. Collections → payment → invoice → cargo unwinds the way it was
 * walked.
 *
 * IN THE URL, NOT IN MEMORY. It survives a refresh, a shared link, a phone
 * locking mid-task, and the WeChat webview the Guangzhou desk lives in, which
 * starts a fresh history on every open. Browser history cannot do that, and
 * `router.back()` cannot tell an entry the user walked from one the app
 * redirected through.
 *
 * A DEEP LINK HAS NO TRAIL, and that is fine: a notification, a bookmark or a
 * QR scan lands with none, and the page falls back to its own relationship —
 * which is the honest answer when nobody walked anywhere.
 */

/** The query parameter the trail rides in. */
export const RETURN_PARAM = "from";

/**
 * How deep the trail is kept.
 *
 * Five is more levels than any real workflow here — collections, payment,
 * invoice, cargo, customer — and the cap is what stops a URL growing without
 * limit when somebody circles between related records for an afternoon.
 */
const MAX_DEPTH = 5;

/**
 * Only our own pages, ever.
 *
 * The trail is a redirect target that arrives in a URL anybody can edit. A
 * value that is not a plain in-app path is discarded rather than corrected:
 * "//evil.example" is a protocol-relative address that a browser will happily
 * treat as another origin, and a back button that can be aimed off-site is an
 * open redirect.
 */
function isOurs(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/app/") &&
    !path.startsWith("/app//") &&
    !path.includes("\\") &&
    path.length < 512
  );
}

/** The trail as it travels: base64url of a JSON array of paths. */
export function encodeTrail(trail: string[]): string {
  const kept = trail.filter(isOurs).slice(-MAX_DEPTH);
  if (kept.length === 0) return "";
  return Buffer.from(JSON.stringify(kept), "utf8").toString("base64url");
}

export function decodeTrail(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => isOurs(entry)).slice(-MAX_DEPTH);
  } catch {
    /* Somebody's URL got mangled in a WhatsApp forward. A broken trail is no
       trail — the page falls back to its own relationship rather than erroring
       on the way to somewhere the reader can see. */
    return [];
  }
}

/**
 * This page's own address, query and all.
 *
 * The query is what makes the trail worth having: it carries the tab, the
 * filter, the page number and the search box, so going back lands on the list
 * as it was rather than at the top of a fresh one. The trail parameter itself
 * is dropped — the trail travels beside it, and nesting it inside itself is how
 * a URL doubles in length at every step.
 */
export function hereWith(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === RETURN_PARAM || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined && one !== "") query.append(key, one);
    }
  }
  const rest = query.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/**
 * A link to a detail page that remembers this one.
 *
 * `here` is where the reader is standing; `incoming` is the trail they arrived
 * with. The result carries both, so the next page back-links to this one and
 * the one after that back-links through it.
 */
export function linkWithTrail(
  target: string,
  here: string,
  incoming?: string | string[] | undefined
): string {
  const trail = encodeTrail([...decodeTrail(incoming), here]);
  if (!trail) return target;
  const joiner = target.includes("?") ? "&" : "?";
  return `${target}${joiner}${RETURN_PARAM}=${trail}`;
}

/** What every list in the app is called, longest prefix first. */
const NAMES: { prefix: string; label: string }[] = [
  { prefix: "/app/collections/follow-up", label: "Payment follow-up" },
  { prefix: "/app/collections/submissions", label: "Payment history" },
  { prefix: "/app/collections", label: "Collections" },
  { prefix: "/app/finance/payments/new", label: "Record a payment" },
  { prefix: "/app/finance/transactions", label: "The Ledger" },
  { prefix: "/app/finance/invoices", label: "Bills" },
  { prefix: "/app/finance/pickup-notes", label: "Pickup notes" },
  { prefix: "/app/finance/expenses", label: "Expenses" },
  { prefix: "/app/finance/accounts", label: "Accounts" },
  { prefix: "/app/finance/credit", label: "Credit" },
  { prefix: "/app/finance/payroll", label: "Payroll" },
  { prefix: "/app/finance/reports", label: "Profit & loss" },
  { prefix: "/app/finance/pricing", label: "Price Configuration" },
  { prefix: "/app/finance", label: "Finance" },
  { prefix: "/app/manager/reconciliation", label: "Reconciliation" },
  { prefix: "/app/manager/finance", label: "Money" },
  { prefix: "/app/manager/batches", label: "Flights" },
  { prefix: "/app/manager", label: "Command centre" },
  { prefix: "/app/shipments", label: "Arrived batches" },
  { prefix: "/app/batches", label: "Loading batches" },
  { prefix: "/app/cargo", label: "Cargo" },
  { prefix: "/app/customers", label: "Customers" },
  { prefix: "/app/support/tickets", label: "Tickets" },
  { prefix: "/app/support/sourcing", label: "Sourcing requests" },
  { prefix: "/app/support", label: "Support" },
  { prefix: "/app/exceptions", label: "Issues & Claims" },
  { prefix: "/app/admin/users", label: "Staff" },
  { prefix: "/app/admin/deleted", label: "Deleted records" },
  { prefix: "/app/admin", label: "Administration" },
  { prefix: "/app/receive", label: "Receive" },
  { prefix: "/app/release", label: "Release" },
  { prefix: "/app/notifications", label: "Notifications" },
  { prefix: "/app/dashboard", label: "Home" },
];

/** What to call a page the reader is being sent back to. */
export function labelForPath(path: string): string | null {
  const clean = path.split("?")[0];
  return NAMES.find((row) => clean.startsWith(row.prefix))?.label ?? null;
}

export type BackTarget = { href: string; label: string };

/**
 * Where back goes, and what it is called.
 *
 * The trail wins when there is one, because it is where the reader actually
 * walked from. The fallback is the page's own relationship — the batch a
 * consignment flew on, the customer a bill belongs to — which is the truthful
 * answer for somebody who arrived from a notification and walked nowhere.
 */
export function backTarget(
  raw: string | string[] | undefined,
  fallback: BackTarget | null
): BackTarget | null {
  const trail = decodeTrail(raw);
  const last = trail[trail.length - 1];
  if (!last) return fallback;
  return { href: last, label: labelForPath(last) ?? fallback?.label ?? "Back" };
}
