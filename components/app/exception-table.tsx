"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Coins, ImageOff } from "lucide-react";

import {
  EXCEPTION_GROUPS,
  TYPE_META,
} from "@/components/app/exception-card";
import {
  InvestigationActions,
  type InvestigationAllowances,
} from "@/components/app/investigation-actions";
import { InvestigationTimeline } from "@/components/app/investigation-timeline";
import { RecordCompensationForm } from "@/components/app/compensation-form";
import { LifecycleSteps } from "@/components/app/lifecycle-steps";
import { useT } from "@/components/app/locale-provider";
import { ResolveInvestigationForm } from "@/components/app/resolve-investigation-form";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  DAMAGE_SEVERITY_LABELS,
  EXCEPTION_TERMINAL_STATUSES,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  EXCEPTION_STATUS_TONES,
  type InvestigationPhoto,
  type InvestigationRecord,
} from "@/lib/investigation-lifecycle";

/**
 * The investigation queue, as a table.
 *
 * It was a stack of tall cards, which reads fine when there are two cases and
 * becomes a scroll marathon at twenty — and twenty is a normal week here. A
 * busy desk needs to see every open case at once and pick the one to chase, so
 * this is one line per case with the detail folded away behind it.
 *
 * The five things that decide which case to chase are all in the row: how old
 * it is, what kind of problem it is, where the case has got to, whose cargo it
 * is, and how many boxes are actually accounted for. Everything the spec calls
 * the investigation record — the photos from China, the photos taken on the
 * Dar floor, who reported it, the notes, the payout, the full timeline — opens
 * on demand underneath.
 *
 * No money reaches this component unless the viewer may see it. The amount is
 * resolved to a string on the server and arrives as `null` for anyone without
 * `finance.view`, so a warehouse phone never receives the figure at all.
 */

/** Whole days a case has been open. Same rule the cards used. */
function daysOpen(raisedAt: Date, resolvedAt: Date | null) {
  const end = resolvedAt ?? new Date();
  return Math.max(
    0,
    Math.floor((end.getTime() - new Date(raisedAt).getTime()) / 86_400_000)
  );
}

const COLUMNS = 9;

export function ExceptionTable({
  exceptions,
  allow,
  assignees,
  closed = false,
}: {
  exceptions: InvestigationRecord[];
  allow: InvestigationAllowances;
  /** Empty unless the viewer may reassign cases. */
  assignees: { id: string; name: string; roleLabel: string }[];
  /** A historical list rather than a live queue — styled back. */
  closed?: boolean;
}) {
  const t = useT();

  if (exceptions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 font-medium">{t("Problem")}</th>
              <th className="px-3 py-2 font-medium">{t("Case")}</th>
              <th className="px-3 py-2 font-medium">{t("Tracking")}</th>
              <th className="px-3 py-2 font-medium">{t("Customer")}</th>
              <th className="hidden px-3 py-2 font-medium xl:table-cell">
                {t("Goods")}
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {t("Boxes here")}
              </th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                {t("Cargo status")}
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {closed ? t("Closed") : t("Open for")}
              </th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((exception) => (
              <ExceptionRow
                key={exception.id}
                exception={exception}
                allow={allow}
                assignees={assignees}
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
  allow,
  assignees,
  closed,
}: {
  exception: InvestigationRecord;
  allow: InvestigationAllowances;
  assignees: { id: string; name: string; roleLabel: string }[];
  closed: boolean;
}) {
  const t = useT();
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
              {open ? t("Hide case detail") : t("Show case detail")}
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
              {t(EXCEPTION_TYPE_LABELS[exception.type])}
            </Badge>
          </span>
        </td>

        {/* Where the case has got to. Without this column the queue could only
            say a case existed, not whether anybody had picked it up. */}
        <td className="whitespace-nowrap px-3 py-1.5">
          <span className="flex items-center gap-1.5">
            <Badge variant={EXCEPTION_STATUS_TONES[exception.status]}>
              {t(EXCEPTION_STATUS_LABELS[exception.status])}
            </Badge>
            {exception.compensation && !exception.compensation.paidAt ? (
              <Coins
                className="h-3.5 w-3.5 text-warning"
                aria-label={t("Payout recorded, not yet paid")}
              />
            ) : null}
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

        <td className="hidden max-w-[14rem] truncate px-3 py-1.5 xl:table-cell">
          {shipment.description}
        </td>

        {/* The number that decides whether this is a search or a claim. */}
        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {absent.length > 0 ? (
            <span className="font-semibold text-warning">
              {onFloor} {t("of")} {total}
            </span>
          ) : (
            <span>
              {onFloor} {t("of")} {total}
            </span>
          )}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 lg:table-cell">
          <ShipmentStatusBadge status={shipment.status} />
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {closed ? (
            formatDate(exception.resolvedAt)
          ) : (
            <span className={age >= 7 ? "font-semibold text-destructive" : ""}>
              {age === 0 ? t("today") : `${age}d`}
            </span>
          )}
        </td>
      </tr>

      {open ? (
        <tr className="border-t-0">
          <td
            colSpan={COLUMNS}
            id={detailId}
            className="bg-muted/20 px-3 pb-4 pt-0"
          >
            <CaseRecord
              exception={exception}
              allow={allow}
              assignees={assignees}
              absent={absent}
              unit={unit}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * The investigation record the spec lists, in one place.
 *
 * Left column is the case; right column is what was done about it. The
 * timeline is never collapsed inside the detail — an audit trail that needs a
 * second click is an audit trail nobody reads.
 */
function CaseRecord({
  exception,
  allow,
  assignees,
  absent,
  unit,
}: {
  exception: InvestigationRecord;
  allow: InvestigationAllowances;
  assignees: { id: string; name: string; roleLabel: string }[];
  absent: number[];
  unit: { one: string; many: string };
}) {
  const t = useT();
  const { shipment } = exception;

  return (
    // Two columns of equal weight. At 3fr/2fr the left ran out of content
    // halfway down and left a column of empty grey beside a dense form; the
    // case and what was done about it deserve the same room.
    <div className="space-y-3 pt-3">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* ---- The case ------------------------------------------------ */}
        <div className="space-y-3">
          <Panel title={t("Reported issue")}>
            <p className="text-sm">{exception.description}</p>
            {exception.severity ? (
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">
                  {t("Damage severity:")}{" "}
                </span>
                <Badge
                  variant={
                    exception.severity === "TOTAL_LOSS" ||
                    exception.severity === "SEVERE"
                      ? "destructive"
                      : "warning"
                  }
                >
                  {t(DAMAGE_SEVERITY_LABELS[exception.severity])}
                </Badge>
              </p>
            ) : null}
          </Panel>

          <Panel title={t("The case")}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
            <Fact label={t("Reported by")}>
              {exception.raisedByName ?? "—"}
              <span className="block text-muted-foreground">
                {formatDateTime(exception.raisedAt)}
              </span>
            </Fact>
            <Fact label={t("Carried by")}>
              {exception.assignedToName ?? t("Nobody yet")}
            </Fact>
            <Fact label={t("Customer")}>
              {shipment.customerName}
              <span className="block text-muted-foreground">
                {shipment.customerPhone ?? t("no phone on file")}
              </span>
            </Fact>
            <Fact label={t("Shipment")}>
              <span className="font-mono tabular">
                {shipment.trackingNumber}
              </span>
              <span className="block text-muted-foreground">
                {shipment.description}
              </span>
            </Fact>
            <Fact label={t("Original batch")}>
              {exception.batch ? (
                <>
                  <Link
                    href={`/app/batches/${exception.batch.id}`}
                    className="focus-ring rounded font-mono tabular hover:text-brand"
                  >
                    {exception.batch.batchNumber}
                  </Link>
                  <span className="block text-muted-foreground">
                    {[exception.batch.airline, exception.batch.flightNumber]
                      .filter(Boolean)
                      .join(" ") || t("flight not recorded")}
                    {exception.batch.arrivalDate
                      ? ` · ${t("landed")} ${formatDate(exception.batch.arrivalDate)}`
                      : ""}
                  </span>
                </>
              ) : (
                t("Not on a dispatch")
              )}
            </Fact>
            <Fact label={t("Where the cargo is")}>
              {absent.length === 0
                ? `${t("Every")} ${t(unit.one)} ${t("is in the Dar warehouse.")}`
                : `${t(unit.one)} ${absent.join(", ")} ${t("not accounted for.")}`}
            </Fact>
          </dl>
          </Panel>

          {/* Every box, so a shortage names the missing sequence rather than
              only counting it. Floating loose above the photos they read as
              decoration; labelled and with a key they read as a count. */}
          {shipment.packages.length > 0 ? (
            <Panel
              title={`${t(unit.many)} ${t("on the manifest")}`}
              aside={
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-success/60" />
                    {t("here")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm border border-dashed border-destructive/60" />
                    {t("not accounted for")}
                  </span>
                </span>
              }
            >
            <div className="flex flex-wrap gap-1.5">
              {shipment.packages.map((pkg) => (
                <span
                  key={pkg.sequence}
                  title={
                    pkg.deliveredAt
                      ? t("Collected")
                      : pkg.receivedAt
                        ? t("In the Dar warehouse")
                        : t("Not accounted for")
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
            </Panel>
          ) : null}

          {/* Two sets of photos, kept apart on purpose: an investigation is
              decided by comparing what China photographed against what came
              off the plane. */}
          <Panel title={t("Evidence")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PhotoStrip
                title={t("Photographed in China")}
                photos={exception.chinaPhotos}
                empty={t("No registration photos on file.")}
              />
              <PhotoStrip
                title={t("Photographed on arrival")}
                photos={exception.arrivalPhotos}
                empty={t("Nothing photographed at check-in.")}
              />
            </div>
          </Panel>

          <CompensationPanel exception={exception} allow={allow} />
        </div>

        {/* ---- What was done about it ---------------------------------- */}
        <div className="space-y-3">
          <Panel title={t("Timeline")} aside={<span className="text-xs text-muted-foreground">{t("oldest first")}</span>}>
            <InvestigationTimeline
              events={exception.events}
              openedAt={exception.raisedAt}
              openedByName={exception.raisedByName}
            />
          </Panel>

          {exception.resolutionNote ? (
            <p className="rounded-md bg-muted/60 p-2 text-xs">
              <span className="font-medium">{t("Outcome:")} </span>
              {exception.resolutionNote}
              {exception.resolvedByName
                ? ` — ${exception.resolvedByName}, ${formatDateTime(exception.resolvedAt)}`
                : ""}
            </p>
          ) : null}

          {!(EXCEPTION_TERMINAL_STATUSES as readonly string[]).includes(
            exception.status
          ) ? (
            <LifecycleSteps
              exceptionId={exception.id}
              status={exception.status}
              allow={allow}
            />
          ) : null}

          <InvestigationActions
            exceptionId={exception.id}
            status={exception.status}
            allow={allow}
            assignees={assignees}
            assignedToId={exception.assignedToId}
          />

          {/* Closing the case. Offered only to someone who may close, and only
              while it is still open — a resolved case shows its outcome above
              instead. */}
          {!(EXCEPTION_TERMINAL_STATUSES as readonly string[]).includes(
            exception.status
          ) && allow.close ? (
            <Panel title={t("Resolve investigation")}>
              <ResolveInvestigationForm exceptionId={exception.id} />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One labelled block of the case record.
 *
 * The detail used to be a run of headings and text with nothing separating
 * them, so the eye had to work out where the issue ended and the cargo began.
 * A panel per subject does that work instead, and gives the two columns a
 * shared rhythm.
 */
function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  /** Optional right-aligned extra — a legend, a count. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function PhotoStrip({
  title,
  photos,
  empty,
}: {
  title: string;
  photos: InvestigationPhoto[];
  empty: string;
}) {
  const t = useT();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {photos.length === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff className="h-3.5 w-3.5" />
          {empty}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              title={`${photo.caption ?? photo.kind} · ${formatDate(photo.createdAt)}${
                photo.onCase ? ` ${t("· attached to this case")}` : ""
              }`}
              className="focus-ring block overflow-hidden rounded border"
            >
              {/* Plain img: these are already-sized warehouse snapshots served
                  from blob storage, and next/image adds a proxy hop for no
                  gain at 56px. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption ?? t("Cargo photo")}
                loading="lazy"
                // 56px was too small to tell a crushed corner from a shadow,
                // which is the entire job of these photos on this page.
                className={`h-20 w-20 object-cover transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100 ${
                  photo.onCase ? "ring-2 ring-inset ring-warning/60" : ""
                }`}
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The payout, for the people allowed to see it.
 *
 * A warehouse clerk sees that a payout exists and whether it has gone out —
 * which is what tells them whether the case is waiting on them or on Finance —
 * and never sees the figure. That is not a styling choice: `amount` is null on
 * the wire for anybody without `finance.view`.
 */
function CompensationPanel({
  exception,
  allow,
}: {
  exception: InvestigationRecord;
  allow: InvestigationAllowances;
}) {
  const t = useT();
  const comp = exception.compensation;
  const finished = (EXCEPTION_TERMINAL_STATUSES as readonly string[]).includes(
    exception.status
  );
  const approved = exception.status === "COMPENSATION_APPROVED";

  // The CEO decides there will be a payout; Finance records what actually went
  // out. Two different desks, so two different controls, and neither is shown
  // to somebody who cannot press it.
  // Approving is a lifecycle step and lives in the step list. This panel is
  // only the money record — what actually left the business.
  const showRecord = allow.compensate && !finished && (approved || Boolean(comp));

  if (!comp) {
    if (!approved) return null;
    return (
      <Panel title={t("Compensation")}>
        <p className="mb-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs text-warning">
          <Coins className="h-3.5 w-3.5 shrink-0" />
          {t("Compensation approved — no payout recorded yet.")}
        </p>
        {showRecord ? (
          <RecordCompensationForm exceptionId={exception.id} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("Finance records the payout.")}
          </p>
        )}
      </Panel>
    );
  }

  return (
    <Panel title={t("Compensation")}>
    <div className="rounded-md border bg-card p-2.5 text-xs">
      <p className="flex flex-wrap items-center gap-2">
        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{t("Compensation")}</span>
        {comp.amount ? (
          <span className="font-semibold tabular">{comp.amount}</span>
        ) : null}
        <Badge variant={comp.paidAt ? "success" : "warning"}>
          {comp.paidAt
            ? `${t("Paid")} ${formatDate(comp.paidAt)}`
            : t("Payment pending")}
        </Badge>
        {comp.methodLabel ? (
          <span className="text-muted-foreground">{comp.methodLabel}</span>
        ) : null}
      </p>
      {comp.note ? (
        <p className="mt-1 text-muted-foreground">{comp.note}</p>
      ) : null}
      {comp.recordedByName ? (
        <p className="mt-1 text-muted-foreground">
          {t("Recorded by")} {comp.recordedByName}
        </p>
      ) : null}
    </div>

    {/* Amending, not adding: recordCompensation updates the settlement in
        place, which is how a payout approved today gets its paid date filled
        in next week. The figures are pre-filled so nobody retypes them. */}
    {showRecord ? (
      <div className="mt-3 border-t pt-3">
        <RecordCompensationForm
          exceptionId={exception.id}
          defaults={
            comp.raw
              ? {
                  amount: comp.raw.amount,
                  currency: comp.raw.currency,
                  paidAt: comp.paidAt
                    ? new Date(comp.paidAt).toISOString().slice(0, 10)
                    : null,
                  method: comp.raw.method,
                  note: comp.note,
                }
              : null
          }
        />
      </div>
    ) : null}
    </Panel>
  );
}

/** Re-exported so the page can keep importing group helpers from one place. */
export { EXCEPTION_GROUPS };
