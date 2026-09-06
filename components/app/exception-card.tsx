import type {
  ExceptionStatus,
  ExceptionType,
  ShipmentStatus,
} from "@prisma/client";
import {
  CircleHelp,
  Landmark,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  PackageSearch,
  PackageX,
  PauseCircle,
  PlaneTakeoff,
  Replace,
  Scale,
  ShieldAlert,
  Shuffle,
} from "lucide-react";

/**
 * WHAT A FLAGGED CONSIGNMENT IS, not how one is drawn.
 *
 * This file used to hold a card component as well, and nothing imported it —
 * every list renders the card defined in exception-table.tsx. What is left is
 * the vocabulary those lists share: the shape of the data, which pill a fault
 * belongs under, and the icon and stripe that go with each one. One place to
 * change what "missing" means, so the exceptions page, the investigation queue
 * and the owner's dashboard cannot drift into three answers.
 */

/**
 * One flagged consignment, as the lists need to read it.
 *
 * The questions are always the same four, in this order: what is wrong, whose
 * cargo is it, which flight brought it, and — the one nobody could answer
 * before — where are the actual boxes right now. The card is laid out to be
 * read in that order without scrolling.
 *
 * Deliberately no money. The Dar floor investigates cargo; what the customer
 * was charged is Finance's business and is not on this page in any form.
 */

type PackageDot = {
  sequence: number;
  receivedAt: Date | null;
  deliveredAt: Date | null;
};

export type ExceptionCardData = {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  description: string;
  raisedAt: Date;
  raisedByName: string | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  shipment: {
    trackingNumber: string;
    status: ShipmentStatus;
    description: string;
    customerName: string;
    customerPhone: string | null;
    packageType: string;
    /** Manifest count, used when a shipment predates per-package labels. */
    declaredPackages: number;
    packages: PackageDot[];
    /** Status only — never an amount. Null when nothing has been paid. */
    settled: "PAID" | "PARTIALLY_PAID" | null;
  };
  batch: {
    id: string;
    batchNumber: string;
    airline: string | null;
    flightNumber: string | null;
    waybillNumber: string | null;
    arrivalDate: Date | null;
  } | null;
};

export type ExceptionGroupKey =
  | "missing"
  | "damaged"
  | "mismatch"
  | "hold"
  | "other";

/**
 * Which pill a flag belongs under.
 *
 * Exhaustive by construction — `satisfies Record<ExceptionType, …>` means a new
 * exception type is a compile error here rather than a case that silently falls
 * into "Other" and is never chased. That is exactly how WRONG_ITEM and
 * HOLD_FOR_INVESTIGATION would have arrived if this were still a chain of ifs.
 */
const TYPE_GROUP = {
  MISSING_SHIPMENT: "missing",
  PACKAGE_COUNT_MISMATCH: "missing",
  /* The pill asks one question — "cargo we do not have" — and both of these
     answer yes. Left in China for weight, or standing behind a customs desk:
     different sentences to the customer, same empty space on the floor, and
     the same person chasing it. */
  SHORT_LANDED: "missing",
  HELD_BY_CUSTOMS: "missing",
  DAMAGED_CARGO: "damaged",
  WEIGHT_MISMATCH: "mismatch",
  WRONG_BATCH: "mismatch",
  // The box is here and intact; what is inside it is not what was booked. That
  // is a mismatch between the paperwork and the goods, not a shortage.
  WRONG_ITEM: "mismatch",
  // The count disagrees with the booking, the other way round from a short
  // one. The boxes are here; the paperwork does not explain all of them.
  OVER_SHIPPED: "mismatch",
  /* Here, and not to be handed over until somebody decides. A box nobody can
     put a name to, and a box carrying something that should never have flown:
     neither is a fault of the cargo, both stop at the counter. */
  UNIDENTIFIED_CARGO: "hold",
  RESTRICTED_ITEM: "hold",
  // A quarantine, not a fault — nothing is provably wrong, the box is simply
  // not to be released until somebody has looked at it. It gets its own pill
  // because "why is this not going out" has a different answer here.
  HOLD_FOR_INVESTIGATION: "hold",
  OTHER: "other",
} as const satisfies Record<ExceptionType, ExceptionGroupKey>;

export function groupOf(type: ExceptionType): ExceptionGroupKey {
  return TYPE_GROUP[type];
}

function typesIn(group: ExceptionGroupKey): ExceptionType[] {
  return (Object.keys(TYPE_GROUP) as ExceptionType[]).filter(
    (type) => TYPE_GROUP[type] === group
  );
}

/** Which flag is it — used for the pills, the icon and the stripe colour. */
export const EXCEPTION_GROUPS: Record<
  ExceptionGroupKey,
  { label: string; types: ExceptionType[] }
> = {
  missing: { label: "Missing", types: typesIn("missing") },
  damaged: { label: "Damaged", types: typesIn("damaged") },
  mismatch: { label: "Wrong item, batch or weight", types: typesIn("mismatch") },
  hold: { label: "On hold", types: typesIn("hold") },
  other: { label: "Other", types: typesIn("other") },
};

export const TYPE_META = {
  MISSING_SHIPMENT: { icon: PackageX, stripe: "border-l-destructive" },
  PACKAGE_COUNT_MISMATCH: { icon: PackageMinus, stripe: "border-l-destructive" },
  DAMAGED_CARGO: { icon: PackageOpen, stripe: "border-l-warning" },
  WEIGHT_MISMATCH: { icon: Scale, stripe: "border-l-info" },
  WRONG_BATCH: { icon: Shuffle, stripe: "border-l-info" },
  WRONG_ITEM: { icon: Replace, stripe: "border-l-warning" },
  // Amber, not red: it is late, not lost, and the stripe should not read like
  // a search when the answer is "Friday".
  SHORT_LANDED: { icon: PlaneTakeoff, stripe: "border-l-warning" },
  HELD_BY_CUSTOMS: { icon: Landmark, stripe: "border-l-warning" },
  UNIDENTIFIED_CARGO: { icon: PackageSearch, stripe: "border-l-warning" },
  // Red. Everything else on this list is cargo behaving badly; this is cargo
  // that should never have been in the aircraft.
  RESTRICTED_ITEM: { icon: ShieldAlert, stripe: "border-l-destructive" },
  OVER_SHIPPED: { icon: PackagePlus, stripe: "border-l-info" },
  HOLD_FOR_INVESTIGATION: { icon: PauseCircle, stripe: "border-l-warning" },
  OTHER: { icon: CircleHelp, stripe: "border-l-muted-foreground/40" },
} as const satisfies Record<
  ExceptionType,
  { icon: typeof PackageX; stripe: string }
>;

export function daysOpen(raisedAt: Date, until: Date | null = null) {
  const end = (until ?? new Date()).getTime();
  return Math.max(0, Math.floor((end - raisedAt.getTime()) / 86_400_000));
}
