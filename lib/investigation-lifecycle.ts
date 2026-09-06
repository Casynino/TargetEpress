import type {
  DamageSeverity,
  ExceptionStatus,
  PhotoKind,
} from "@prisma/client";

import type { ExceptionCardData } from "@/components/app/exception-card";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { Permission } from "@/lib/rbac";

/**
 * The investigation lifecycle, as one table.
 *
 * A case is not a boolean. "Open" used to mean "nobody has finished with it",
 * which was fine when the only other value was "resolved" — the moment a case
 * could be *under* investigation, or waiting on the customer, or approved for a
 * payout, every `status === "OPEN"` in the codebase started lying.
 *
 * So the machine lives here, once, and both the buttons in the queue and the
 * server action that moves a case read the same map. A step that is not in this
 * table cannot be taken, whatever the form posts — the action re-reads the row
 * and looks the move up again before it writes anything.
 *
 * Pure data on purpose: no prisma, no server-only. The client table imports it
 * to decide which buttons to draw, the server action imports it to decide
 * whether that button was allowed to exist.
 */

export type StatusTone =
  | "muted"
  | "info"
  | "warning"
  | "success"
  | "brand"
  | "destructive";

export const EXCEPTION_STATUS_TONES: Record<ExceptionStatus, StatusTone> = {
  OPEN: "destructive",
  UNDER_INVESTIGATION: "warning",
  WAITING_CUSTOMER: "info",
  COMPENSATION_APPROVED: "brand",
  REPLACEMENT_APPROVED: "brand",
  CARGO_FOUND: "success",
  CLOSED: "muted",
  RESOLVED: "muted",
  WRITTEN_OFF: "muted",
};

/**
 * Which server action actually performs the move.
 *
 * Two of these steps are not simple status changes and have their own actions:
 * finding a box puts it back in Available Cargo and may return the cargo to
 * Ready for Pickup, and approving a payout starts a Finance workflow. Those
 * live in `lib/actions/investigations.ts` and this queue delegates to them
 * rather than reimplementing the halves it can see — one physical event must
 * not have two pieces of code that write it slightly differently.
 */
export type StepVia =
  | "advance"
  | "cargoFound"
  | "approveCompensation"
  /* Answered from Guangzhou, and nothing like cargoFound: no Dar arrival, no
     package ticked, and the consignment goes back to the loading table rather
     than to the pickup counter. See markFoundInChina. */
  | "foundInChina";

export type LifecycleStep = {
  to: ExceptionStatus;
  /** Imperative, in the words a warehouse clerk would use. */
  label: string;
  /** The permission the *actor* needs. Checked again server-side. */
  permission: Permission;
  tone: "brand" | "warning" | "success" | "danger" | "neutral";
  /** Shown under the button so nobody has to guess what it does. */
  hint: string;
  via: StepVia;
};

/**
 * Where a case can go from where it is.
 *
 * Deliberately not a straight line. A box turns up at any point, which is why
 * "Cargo found" is reachable from every live status; and a customer who stops
 * answering sends a case back to investigation rather than stranding it.
 *
 * The two approvals are `exception.approve`, which only the CEO holds — the
 * owner's rule is that the floor that lost the box does not decide what it was
 * worth. Closing is `exception.close`, also CEO-only, so no desk both approves
 * a payout and declares the matter finished.
 */
export const LIFECYCLE_STEPS: Record<ExceptionStatus, LifecycleStep[]> = {
  OPEN: [
    {
      to: "UNDER_INVESTIGATION",
      via: "advance" as const,
      label: "Start investigating",
      permission: "exception.investigate",
      tone: "brand",
      hint: "Someone is now actively looking for this.",
    },
    {
      to: "CARGO_FOUND",
      via: "cargoFound" as const,
      label: "Cargo found",
      permission: "exception.investigate",
      tone: "success",
      hint: "The boxes are back on the floor and count as received again.",
    },
    {
      to: "CARGO_FOUND",
      via: "foundInChina" as const,
      label: "Found in China",
      permission: "exception.foundInChina",
      tone: "success",
      hint: "It never travelled. Back on the loading table for the next flight.",
    },
  ],
  UNDER_INVESTIGATION: [
    {
      to: "WAITING_CUSTOMER",
      via: "advance" as const,
      label: "Waiting on the customer",
      permission: "exception.investigate",
      tone: "neutral",
      hint: "The customer has been asked what they want done.",
    },
    {
      to: "CARGO_FOUND",
      via: "cargoFound" as const,
      label: "Cargo found",
      permission: "exception.investigate",
      tone: "success",
      hint: "The boxes are back on the floor and count as received again.",
    },
    {
      to: "CARGO_FOUND",
      via: "foundInChina" as const,
      label: "Found in China",
      permission: "exception.foundInChina",
      tone: "success",
      hint: "It never travelled. Back on the loading table for the next flight.",
    },
    {
      to: "COMPENSATION_APPROVED",
      via: "approveCompensation" as const,
      label: "Approve compensation",
      permission: "exception.approve",
      tone: "warning",
      hint: "Authorises a payout. Finance records the amount afterwards.",
    },
    {
      to: "REPLACEMENT_APPROVED",
      via: "advance" as const,
      label: "Approve replacement",
      permission: "exception.approve",
      tone: "warning",
      hint: "The goods will be re-sent rather than paid for.",
    },
  ],
  WAITING_CUSTOMER: [
    {
      to: "UNDER_INVESTIGATION",
      via: "advance" as const,
      label: "Back to investigation",
      permission: "exception.investigate",
      tone: "neutral",
      hint: "The customer answered, or stopped answering.",
    },
    {
      to: "CARGO_FOUND",
      via: "cargoFound" as const,
      label: "Cargo found",
      permission: "exception.investigate",
      tone: "success",
      hint: "The boxes are back on the floor and count as received again.",
    },
    {
      to: "CARGO_FOUND",
      via: "foundInChina" as const,
      label: "Found in China",
      permission: "exception.foundInChina",
      tone: "success",
      hint: "It never travelled. Back on the loading table for the next flight.",
    },
    {
      to: "COMPENSATION_APPROVED",
      via: "approveCompensation" as const,
      label: "Approve compensation",
      permission: "exception.approve",
      tone: "warning",
      hint: "Authorises a payout. Finance records the amount afterwards.",
    },
    {
      to: "REPLACEMENT_APPROVED",
      via: "advance" as const,
      label: "Approve replacement",
      permission: "exception.approve",
      tone: "warning",
      hint: "The goods will be re-sent rather than paid for.",
    },
  ],
  COMPENSATION_APPROVED: [
    {
      to: "CARGO_FOUND",
      via: "cargoFound" as const,
      label: "Cargo found",
      permission: "exception.investigate",
      tone: "success",
      hint: "Found after all — tell Finance before the payout goes out.",
    },
    {
      to: "CLOSED",
      via: "advance" as const,
      label: "Close the case",
      permission: "exception.close",
      tone: "neutral",
      hint: "Only once Finance has recorded the payment.",
    },
  ],
  REPLACEMENT_APPROVED: [
    {
      to: "CARGO_FOUND",
      via: "cargoFound" as const,
      label: "Cargo found",
      permission: "exception.investigate",
      tone: "success",
      hint: "Found after all — the replacement may not be needed.",
    },
    {
      to: "CLOSED",
      via: "advance" as const,
      label: "Close the case",
      permission: "exception.close",
      tone: "neutral",
      hint: "The replacement has been arranged.",
    },
  ],
  // Terminal, but a found case is still formally closed off by the CEO so the
  // record reads "finished" rather than "stopped being interesting".
  CARGO_FOUND: [
    {
      to: "CLOSED",
      via: "advance" as const,
      label: "Close the case",
      permission: "exception.close",
      tone: "neutral",
      hint: "Signs off a case that ended with the cargo turning up.",
    },
  ],
  CLOSED: [],
  // Legacy terminals. No new code writes them and nothing moves out of them.
  RESOLVED: [],
  WRITTEN_OFF: [],
};

/**
 * THE TWO PLACES THIS APP STILL ASKS FOR A SENTENCE.
 *
 * The owner's rule is warn, confirm, do: nobody explains a delete, a
 * cancellation or an edit, because a box that must be filled in is filled in
 * with "ok" and the audit line already carries who, when and what changed.
 *
 * These two are not that. Neither is an explanation of an action:
 *
 *   CARGO_FOUND        asks WHERE it was found, which is the question the
 *                      next person always asks and which nothing else records
 *   *_APPROVED         authorises money leaving the business on a customer's
 *                      claim — held by the CEO alone, and the one decision
 *                      here with a genuine record to keep
 *
 * Closing a finished case came off the list: it is housekeeping, and the case
 * it closes already says everything that happened inside it.
 */
export const NOTE_REQUIRED_ON: ExceptionStatus[] = [
  "CARGO_FOUND",
  "COMPENSATION_APPROVED",
  "REPLACEMENT_APPROVED",
];

/**
 * Terminal in the sense that it stamps resolvedAt and leaves the live queue.
 * Only consulted for steps this queue performs itself — CARGO_FOUND is stamped
 * by its own action.
 */
export function isTerminalStep(status: ExceptionStatus) {
  return LIFECYCLE_STEPS[status].length === 0;
}

/**
 * THE DESTINATION NO LONGER NAMES THE STEP ON ITS OWN.
 *
 * Two steps reach CARGO_FOUND: Dar saying the boxes are back on the floor, and
 * Guangzhou saying they never left. Same ending, entirely different physical
 * claim — one ticks every package as received in Dar, the other must not.
 * Matching on `to` alone returned whichever was written first, so a press from
 * China was routed to the Dar action, refused for want of a permission China
 * does not hold, and reported nothing to the person who pressed it.
 *
 * So the caller says which route it took. `via` is optional because the older
 * callers pass only a destination, and every status where that is still
 * unambiguous keeps working unchanged.
 */
export function stepTo(
  from: ExceptionStatus,
  to: ExceptionStatus,
  via?: StepVia
): LifecycleStep | null {
  const steps = LIFECYCLE_STEPS[from];
  if (via) return steps.find((s) => s.to === to && s.via === via) ?? null;
  return steps.find((step) => step.to === to) ?? null;
}

/**
 * The steps out of a status, in the language the reader works in.
 *
 * LIFECYCLE_STEPS above holds the English, and that English doubles as the
 * dictionary key. The machinery — which target status, which permission, which
 * action performs it — stays one table; only the two words on the button and
 * the line under it change per reader, so a Chinese warehouse and a Dar desk
 * cannot end up with different sets of buttons.
 */
export function lifecycleSteps(
  status: ExceptionStatus,
  locale: Locale = "en"
): LifecycleStep[] {
  return (LIFECYCLE_STEPS[status] ?? []).map((step) => ({
    ...step,
    label: t(locale, step.label),
    hint: t(locale, step.hint),
  }));
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * ExceptionEvent.action is a short machine string. It is never rendered raw —
 * an audit trail a customer-support agent cannot read is not an audit trail.
 */
const EVENT_LABELS: Record<string, string> = {
  opened: "Case opened",
  "status.changed": "Status changed",
  "note.added": "Note added",
  "photo.added": "Evidence added",
  "cargo.found": "Cargo found",
  assigned: "Case assigned",
  "compensation.recorded": "Compensation recorded",
  closed: "Case closed",
};

export function eventLabel(action: string, locale: Locale = "en") {
  const label = EVENT_LABELS[action];
  // The fallback is the raw machine string tidied up. Nothing to translate —
  // an action code nobody has named yet has no wording to render.
  return label ? t(locale, label) : action.replace(/[._]/g, " ");
}

// ---------------------------------------------------------------------------
// The investigation record, as the queue renders it
// ---------------------------------------------------------------------------

export type InvestigationPhoto = {
  id: string;
  url: string;
  kind: PhotoKind;
  caption: string | null;
  createdAt: Date;
  /** True when the photo was attached to this case rather than the shipment. */
  onCase: boolean;
};

export type InvestigationEvent = {
  id: string;
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: Date;
};

/**
 * What the viewer is allowed to know about the payout.
 *
 * `amount` is null for anyone without `finance.view` — the warehouse must be
 * able to see that a case is waiting on money without ever seeing the figure,
 * so the presence of a payout and its size are two different facts.
 */
export type InvestigationCompensation = {
  exists: true;
  paidAt: Date | null;
  /** Formatted string or null when the viewer may not see money. */
  amount: string | null;
  note: string | null;
  recordedByName: string | null;
  /** Which company account the money left. Same finance.view gate as `amount`. */
  accountName: string | null;
  /**
   * The same figures unformatted, for re-opening the record-a-payout form on a
   * settlement that already exists — filling in the paid date later is the same
   * form again, and it must not make somebody retype the amount.
   *
   * Behind the identical finance.view gate as `amount`: a warehouse phone
   * learns that a payout exists and never what it was worth.
   */
  raw: {
    amount: string;
    currency: string;
    accountId: string | null;
  } | null;
};

export type InvestigationRecord = ExceptionCardData & {
  severity: DamageSeverity | null;
  assignedToId: string | null;
  assignedToName: string | null;
  /** Registration shots taken in China, before the cargo flew. */
  chinaPhotos: InvestigationPhoto[];
  /** Shot on the Dar floor — arrival and damage evidence. */
  arrivalPhotos: InvestigationPhoto[];
  /** Oldest first: a case log reads as a story, not a feed. */
  events: InvestigationEvent[];
  compensation: InvestigationCompensation | null;
};
