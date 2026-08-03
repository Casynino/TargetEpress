"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  EXCEPTION_GROUPS,
  TYPE_META,
  type ExceptionCardData,
} from "@/components/app/exception-card";
import { ResolveExceptionForm } from "@/components/app/resolve-exception-form";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { EXCEPTION_TYPE_LABELS, PACKAGE_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * The investigation queue, as a table.
 *
 * It was a stack of tall cards, which reads fine when there are two cases and
 * becomes a scroll marathon at twenty — and twenty is a normal week here. A
 * busy desk needs to see every open case at once and pick the one to chase, so
 * this is one line per case with the detail folded away behind it.
 *
 * The four things that decide which case to chase are all in the row: how old
 * it is, what kind of problem it is, whose cargo it is, and how many boxes are
 * actually accounted for. Everything else — the description, the flight, the
 * package sequence numbers, the resolve box — opens on demand.
 */

/** Whole days a case has been open. Same rule the cards used. */
function daysOpen(raisedAt: Date, resolvedAt: Date | null) {
  const end = resolvedAt ?? new Date();
  return Math.max(
    0,
    Math.floor((end.getTime() - new Date(raisedAt).getTime()) / 86_400_000)
  );
}

export function ExceptionTable({
  exceptions,
  canResolve,
  closed = false,
}: {
  exceptions: ExceptionCardData[];
  canResolve: boolean;
  /** Closed cases are read-only and styled back. */
  closed?: boolean;
}) {
  if (exceptions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 font-medium">Problem</th>
              <th className="px-3 py-2 font-medium">Tracking</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                Goods
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                Boxes here
              </th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                Cargo status
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {closed ? "Closed" : "Open for"}
              </th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((exception) => (
              <ExceptionRow
                key={exception.id}
                exception={exception}
                canResolve={canResolve}
                closed={closed}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExceptionRow({
  exception,
  canResolve,
  closed,
}: {
  exception: ExceptionCardData;
  canResolve: boolean;
  closed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailId = `case-${exception.id}`;

  const meta = TYPE_META[exception.type];
  const Icon = meta.icon;
  const { shipment } = exception;

  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  const total = shipment.packages.length || shipment.declaredPackages;
  const onFloor = shipment.packages.filter((p) => p.receivedAt).length;
  const absent = shipment.packages
    .filter((p) => !p.receivedAt)
    .map((p) => p.sequence);
  const age = daysOpen(exception.raisedAt, exception.resolvedAt);

  return (
    <>
      <tr
        id={`exception-${exception.id}`}
        className={`scroll-mt-24 border-t align-middle ${
          closed ? "text-muted-foreground" : "hover:bg-muted/40"
        }`}
      >
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                open ? "rotate-90" : ""
              }`}
            />
            <span className="sr-only">
              {open ? "Hide case detail" : "Show case detail"}
            </span>
          </button>
        </td>

        <td className="whitespace-nowrap px-3 py-1.5">
          <span className="flex items-center gap-2">
            <Icon
              className={`h-4 w-4 shrink-0 ${
                closed ? "text-muted-foreground" : "text-destructive"
              }`}
            />
            <Badge variant={closed ? "muted" : "destructive"}>
              {EXCEPTION_TYPE_LABELS[exception.type]}
            </Badge>
          </span>
        </td>

        <td className="whitespace-nowrap px-3 py-1.5">
          <Link
            href={`/app/cargo/${shipment.trackingNumber}`}
            className="focus-ring rounded font-mono text-xs font-semibold tabular hover:text-brand hover:underline"
          >
            {shipment.trackingNumber}
          </Link>
        </td>

        <td className="max-w-[10rem] truncate px-3 py-1.5">
          {shipment.customerName}
        </td>

        <td className="hidden max-w-[14rem] truncate px-3 py-1.5 lg:table-cell">
          {shipment.description}
        </td>

        {/* The number that decides whether this is a search or a claim. */}
        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {absent.length > 0 ? (
            <span className="font-semibold text-warning">
              {onFloor} of {total}
            </span>
          ) : (
            <span>
              {onFloor} of {total}
            </span>
          )}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 md:table-cell">
          <ShipmentStatusBadge status={shipment.status} />
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {closed ? (
            formatDate(exception.resolvedAt)
          ) : (
            <span className={age >= 7 ? "font-semibold text-destructive" : ""}>
              {age === 0 ? "today" : `${age}d`}
            </span>
          )}
        </td>
      </tr>

      {open ? (
        <tr className="border-t-0">
          <td colSpan={8} id={detailId} className="bg-muted/20 px-3 pb-3 pt-0">
            <div className="space-y-3 pt-2">
              <p className="text-sm">{exception.description}</p>

              <dl className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Raised</dt>
                  <dd>
                    {formatDateTime(exception.raisedAt)}
                    {exception.raisedByName
                      ? ` · ${exception.raisedByName}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Arrived on</dt>
                  <dd>
                    {exception.batch ? (
                      <>
                        {exception.batch.batchNumber}
                        {exception.batch.airline
                          ? ` · ${exception.batch.airline} ${exception.batch.flightNumber ?? ""}`
                          : ""}
                      </>
                    ) : (
                      "Not on a dispatch"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Where the cargo is</dt>
                  <dd>
                    {absent.length === 0
                      ? `Every ${unit.one} is in the Dar warehouse.`
                      : `${unit.one} ${absent.join(", ")} not accounted for.`}
                  </dd>
                </div>
              </dl>

              {/* Every box, so a shortage names the missing sequence rather
                  than only counting it. */}
              {shipment.packages.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {shipment.packages.map((pkg) => (
                    <span
                      key={pkg.sequence}
                      title={
                        pkg.deliveredAt
                          ? "Collected"
                          : pkg.receivedAt
                            ? "In the Dar warehouse"
                            : "Not accounted for"
                      }
                      className={`inline-flex h-7 min-w-7 items-center justify-center rounded border px-2 text-xs font-semibold tabular ${
                        pkg.receivedAt
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-dashed border-destructive/50 text-destructive"
                      }`}
                    >
                      {pkg.sequence}
                    </span>
                  ))}
                </div>
              ) : null}

              {closed ? (
                <p className="rounded-md bg-muted/60 p-2 text-xs">
                  Closed by {exception.resolvedByName ?? "—"} on{" "}
                  {formatDateTime(exception.resolvedAt)}
                  {exception.resolutionNote
                    ? ` — ${exception.resolutionNote}`
                    : ""}
                </p>
              ) : canResolve ? (
                <ResolveExceptionForm exceptionId={exception.id} />
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Re-exported so the page can keep importing group helpers from one place. */
export { EXCEPTION_GROUPS };
