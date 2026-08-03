import Link from "next/link";
import type {
  ExceptionStatus,
  ExceptionType,
  ShipmentStatus,
} from "@prisma/client";
import {
  CircleHelp,
  PackageMinus,
  PackageOpen,
  PackageX,
  PauseCircle,
  Plane,
  Replace,
  Scale,
  Shuffle,
  User,
  Warehouse,
} from "lucide-react";

import { ResolveExceptionForm } from "@/components/app/resolve-exception-form";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * One flagged consignment, as an investigator needs to read it.
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
  DAMAGED_CARGO: "damaged",
  WEIGHT_MISMATCH: "mismatch",
  WRONG_BATCH: "mismatch",
  // The box is here and intact; what is inside it is not what was booked. That
  // is a mismatch between the paperwork and the goods, not a shortage.
  WRONG_ITEM: "mismatch",
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

export function ExceptionCard({
  exception,
  canResolve,
}: {
  exception: ExceptionCardData;
  canResolve: boolean;
}) {
  // "Open" is no longer one status. A case being worked, waiting on a customer
  // or approved for a payout is still unfinished, and reading `=== "OPEN"` here
  // would draw a case under active investigation as though it were closed.
  const open = (EXCEPTION_OPEN_STATUSES as readonly ExceptionStatus[]).includes(
    exception.status
  );
  const meta = TYPE_META[exception.type];
  const Icon = meta.icon;
  const age = daysOpen(exception.raisedAt, exception.resolvedAt);

  const { shipment } = exception;
  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  const total = shipment.packages.length || shipment.declaredPackages;
  const onFloor = shipment.packages.filter((p) => p.receivedAt).length;
  const absent = shipment.packages
    .filter((p) => !p.receivedAt)
    .map((p) => p.sequence);
  const collected = shipment.packages.filter((p) => p.deliveredAt).length;

  return (
    <li
      id={`exception-${exception.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-xl border border-l-4 bg-card shadow-soft ${
        open ? meta.stripe : "border-l-success/50"
      }`}
    >
      {/* ---- What is wrong -------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <Icon
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              open ? "text-destructive" : "text-muted-foreground"
            }`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={open ? "destructive" : "muted"}>
                {EXCEPTION_TYPE_LABELS[exception.type]}
              </Badge>
              <Link
                href={`/app/cargo/${shipment.trackingNumber}`}
                className="focus-ring rounded font-mono text-sm font-semibold tabular hover:text-brand"
              >
                {shipment.trackingNumber}
              </Link>
              <ShipmentStatusBadge status={shipment.status} />
              {shipment.settled ? (
                // Status, never a figure: cargo the customer has already paid
                // for is the shortage you chase first.
                <Badge variant="outline" className="text-xs">
                  {shipment.settled === "PAID"
                    ? "Customer has paid"
                    : "Part-paid"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm">{exception.description}</p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold tabular ${
              open && age >= 7
                ? "text-destructive"
                : open && age >= 2
                  ? "text-warning"
                  : "text-muted-foreground"
            }`}
          >
            {open
              ? age === 0
                ? "Today"
                : `${age} day${age === 1 ? "" : "s"} open`
              : "Closed"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(exception.raisedAt)}
          </p>
        </div>
      </div>

      {/* ---- Whose cargo, which flight, where the boxes are ------------ */}
      <div className="grid gap-px border-t bg-border sm:grid-cols-3">
        <Field icon={User} label="Customer">
          <p className="truncate text-sm font-medium">{shipment.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {shipment.customerPhone ?? "no phone on file"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {shipment.description}
          </p>
        </Field>

        <Field icon={Plane} label="Arrived on">
          {exception.batch ? (
            <>
              <Link
                href={`/app/batches/${exception.batch.id}`}
                className="focus-ring rounded font-mono text-sm tabular hover:text-brand"
              >
                {exception.batch.batchNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {[exception.batch.airline, exception.batch.flightNumber]
                  .filter(Boolean)
                  .join(" ") || "flight not recorded"}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {exception.batch.waybillNumber
                  ? `AWB ${exception.batch.waybillNumber} · `
                  : ""}
                landed {formatDate(exception.batch.arrivalDate)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No batch — flagged outside a flight.
            </p>
          )}
        </Field>

        <Field icon={Warehouse} label="Where the cargo is">
          <p className="text-sm font-medium tabular">
            {total === 0
              ? "No packages on record"
              : `${onFloor} of ${total} ${total === 1 ? unit.one : unit.many} checked in at Dar`}
          </p>

          {shipment.packages.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {shipment.packages.map((pkg) => (
                <span
                  key={pkg.sequence}
                  title={
                    pkg.deliveredAt
                      ? `${unit.one} ${pkg.sequence} collected`
                      : pkg.receivedAt
                        ? `${unit.one} ${pkg.sequence} checked in`
                        : `${unit.one} ${pkg.sequence} not accounted for`
                  }
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 text-xs font-semibold tabular ${
                    pkg.deliveredAt
                      ? "border-muted-foreground/30 text-muted-foreground line-through"
                      : pkg.receivedAt
                        ? "border-success/50 bg-success/10 text-success"
                        : "border-dashed border-destructive/60 text-destructive"
                  }`}
                >
                  {pkg.sequence}
                </span>
              ))}
            </div>
          ) : null}

          {absent.length > 0 ? (
            <p className="mt-1.5 text-xs text-destructive">
              {absent.length === 1 ? unit.one : unit.many}{" "}
              {absent.map((n) => `#${n}`).join(", ")} not accounted for
              {onFloor > 0 ? " — the rest is in the warehouse." : "."}
            </p>
          ) : total > 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {collected > 0
                ? `Every ${unit.one} arrived, ${collected} already collected.`
                : `Every ${unit.one} is in the Dar warehouse.`}
            </p>
          ) : null}

          {/* The system saying "in the air" while boxes are on the floor is
              itself a fault worth showing — it is how cargo goes missing on
              paper. */}
          {shipment.status === "IN_TRANSIT" && onFloor > 0 ? (
            <p className="mt-1.5 text-xs text-warning">
              Boxes are checked in but the shipment still reads In transit —
              finish its check-in.
            </p>
          ) : null}
        </Field>
      </div>

      {/* ---- Who raised it, and how it gets closed --------------------- */}
      <div className="border-t px-4 py-3 sm:px-5">
        <p className="text-xs text-muted-foreground">
          Raised by {exception.raisedByName ?? "—"} on{" "}
          {formatDateTime(exception.raisedAt)}
          {exception.resolvedAt
            ? ` · closed by ${exception.resolvedByName ?? "—"} on ${formatDateTime(exception.resolvedAt)}`
            : ""}
        </p>

        {exception.resolutionNote ? (
          <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
            {exception.resolutionNote}
          </p>
        ) : null}

        {open && canResolve ? (
          <div className="mt-3">
            <ResolveExceptionForm exceptionId={exception.id} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof PackageX;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 sm:px-5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
