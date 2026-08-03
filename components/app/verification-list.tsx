"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import type {
  BatchStatus,
  GoodsType,
  Origin,
  ShipmentStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Search,
} from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  completeVerification,
  verifyBatchAll,
  verifyShipment,
} from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import {
  EXCEPTION_TYPE_LABELS,
  GOODS_TYPE_LABELS,
  ORIGIN_LABELS,
  PACKAGE_TYPE_LABELS,
  enumOptions,
  formatPackages,
  formatPackagesShort,
} from "@/lib/constants";
import { formatWeight } from "@/lib/format";

type PackageRow = {
  id: string;
  sequence: number;
  reference: string;
  /** Formatted server-side; null when only the shipment total was weighed. */
  weightLabel: string | null;
  received: boolean;
};

type Row = {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  packages: number;
  packageType: string;
  packageList: PackageRow[];
  photos: { id: string; url: string; kind: string; caption: string | null }[];
  weightKg: number;
  description: string;
  goodsType: GoodsType;
  origin: Origin;
  cartonRef: string | null;
  internalNote: string | null;
  status: ShipmentStatus;
  verification: { result: string; note: string | null } | null;
};

/**
 * The arrival checklist.
 *
 * Built around what actually happens: a flight arrives intact almost every
 * time. Loss and damage are real but rare, so the screen is shaped for the
 * common case — one button accepts the whole manifest — and the per-shipment
 * controls exist for the handful that need flagging.
 *
 * It used to demand eighty-seven individual confirmations to record "the
 * flight was fine", which is the same information at eighty-seven times the
 * cost, and a checklist that expensive gets clicked through without being read.
 *
 * Accepting in bulk deliberately skips any shipment that already has a
 * verification, so pressing it cannot wipe an exception somebody raised.
 */
export function VerificationList({
  batchId,
  batchStatus,
  shipments,
}: {
  batchId: string;
  batchStatus: BatchStatus;
  shipments: Row[];
}) {
  const checked = shipments.filter((s) => s.verification).length;
  const flagged = shipments.filter(
    (s) => s.verification?.result === "EXCEPTION"
  ).length;
  const remaining = shipments.length - checked;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-4 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:bg-card sm:backdrop-blur-none">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {checked} of {shipments.length} checked
            {flagged > 0 ? ` · ${flagged} flagged` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${shipments.length ? (checked / shipments.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        {batchStatus === "ARRIVED" ? (
          <div className="flex flex-wrap items-center gap-2">
            {remaining > 0 ? (
              <AcceptAllButton batchId={batchId} remaining={remaining} />
            ) : null}
            <CompleteButton batchId={batchId} disabled={remaining > 0} />
          </div>
        ) : null}
      </div>

      {batchStatus === "ARRIVED" && remaining > 0 ? (
        <p className="text-xs text-muted-foreground">
          Everything normally arrives as sent. Accept the whole manifest, then
          flag only what is missing or damaged.
        </p>
      ) : null}

      {/* The same table the China desk reads, so a person who works both ends
          is looking at one layout. The only additions are the two actions and
          the row expander — check-in is the China cargo list plus a decision. */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">Tracking</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Goods</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">
                  Type
                </th>
                <th className="px-3 py-2 text-right font-medium">Weight</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  Counted as
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Proof
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Status
                </th>
                <th className="w-24 px-3 py-2 text-center font-medium">Check</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => (
                <VerificationRow
                  key={shipment.id}
                  batchId={batchId}
                  shipment={shipment}
                  locked={batchStatus !== "ARRIVED"}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Accept everything still unruled on.
 *
 * Sized and coloured as the primary action because it is the one taken almost
 * every time. The count is in the label so nobody presses it without seeing
 * how many lines it covers.
 */
function AcceptAllButton({
  batchId,
  remaining,
}: {
  batchId: string;
  remaining: number;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyBatchAll,
    { ok: true }
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton variant="signal" className="rounded-lg" size="sm">
        <CheckCheck className="mr-2 h-4 w-4" />
        All {remaining} present &amp; undamaged
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

function VerificationRow({
  batchId,
  shipment,
  locked,
}: {
  batchId: string;
  shipment: Row;
  locked: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyShipment,
    { ok: true }
  );
  const [flagging, setFlagging] = useState(false);
  // Collapsed by default. The dense list is the point of this screen; the detail
  // is for the one row the operator is standing in front of, and it is mounted
  // only when opened so the other eighty-six cost nothing to render or fetch.
  const [open, setOpen] = useState(false);
  const detailId = useId();
  // Everything is assumed present — the common case is a complete shipment, and
  // the operator only has to act when something is missing.
  const [present, setPresent] = useState<string[]>(
    shipment.packageList.map((pkg) => pkg.id)
  );
  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;

  const done = shipment.verification?.result === "VERIFIED";
  const flagged = shipment.verification?.result === "EXCEPTION";
  const short = shipment.packageList.filter((pkg) => !pkg.received).length;
  // Anything flagged, or checked in short, now lives in the investigation
  // queue. The row it was flagged on is where somebody stands when they ask
  // "and where did that carton go?", so the answer is one click from here.
  // Untouched rows are excluded: their boxes read "not received" simply
  // because nobody has checked them in yet.
  const investigate = Boolean(shipment.verification) && (flagged || short > 0);

  return (
    <>
      <tr
        className={`border-t align-middle ${
          done
            ? "bg-success/[0.04]"
            : flagged
              ? "bg-destructive/[0.05]"
              : "hover:bg-muted/40"
        }`}
      >
        {/* Expander. The chevron is the whole affordance — the row itself stays
            a table row so the columns line up with the China list. */}
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
              {open ? "Hide cargo detail" : "Show cargo detail"}
            </span>
          </button>
        </td>

        <td className="whitespace-nowrap px-3 py-1.5">
          <span className="flex items-center gap-2">
            {done ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : flagged ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : null}
            <span className="font-mono text-xs font-semibold tabular">
              {shipment.trackingNumber}
            </span>
          </span>
        </td>

        <td className="max-w-[10rem] truncate px-3 py-1.5">
          {shipment.customerName}
        </td>

        <td className="max-w-[14rem] truncate px-3 py-1.5">
          {shipment.description}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 text-muted-foreground lg:table-cell">
          {GOODS_TYPE_LABELS[shipment.goodsType] ?? shipment.goodsType}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {formatWeight(shipment.weightKg)}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {short > 0 && shipment.verification ? (
            <span className="font-semibold text-warning">
              {shipment.packages - short} of{" "}
              {formatPackagesShort(shipment.packages, shipment.packageType)}
            </span>
          ) : (
            formatPackagesShort(shipment.packages, shipment.packageType)
          )}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 md:table-cell">
          {shipment.photos.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular">
              <Camera className="h-3.5 w-3.5" />
              {shipment.photos.length}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 md:table-cell">
          {flagged ? (
            <Badge variant="destructive">Exception</Badge>
          ) : (
            <ShipmentStatusBadge status={shipment.status} />
          )}
        </td>

        {/* The two answers, as icons. Naming them on every one of eighty-seven
            rows spent a third of the table width repeating the same two words;
            the icons carry a title and an sr-only label instead. */}
        <td className="px-3 py-1.5">
          {locked ? null : (
            <div className="flex items-center justify-center gap-1">
              <form action={action}>
                <input type="hidden" name="batchId" value={batchId} />
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input type="hidden" name="result" value="VERIFIED" />
                <SubmitButton
                  variant={done ? "outline" : "brand"}
                  size="icon"
                  className="h-8 w-8"
                  title="Present & correct"
                  pendingLabel=""
                >
                  <Check className="h-4 w-4" />
                  <span className="sr-only">
                    Present and correct — {shipment.trackingNumber}
                  </span>
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setFlagging((v) => !v)}
                title="Something is wrong"
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/5"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="sr-only">
                  Something is wrong — {shipment.trackingNumber}
                </span>
              </button>
            </div>
          )}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          {investigate ? (
            <Link
              href={`/app/exceptions?tracking=${shipment.trackingNumber}`}
              title="Open in the investigation queue"
              className="focus-ring inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              <Search className="h-3 w-3" />
              Case
            </Link>
          ) : (
            <Link
              href={`/app/cargo/${shipment.trackingNumber}`}
              className="focus-ring text-xs font-medium text-brand hover:underline"
            >
              Open
            </Link>
          )}
        </td>
      </tr>

      {/* Everything that is not a column: the China photos, the package list,
          the flag form, and any error. One spanning row so the table keeps its
          alignment. */}
      {open || flagging || shipment.verification?.note || !state.ok ? (
        <tr className="border-t-0">
          <td colSpan={11} className="bg-muted/20 px-3 pb-3 pt-0">
            {open ? <CargoDetail id={detailId} shipment={shipment} /> : null}

            {shipment.verification?.note ? (
              <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                {shipment.verification.note}
              </p>
            ) : null}

            {flagging && !locked ? (
              <div className="mt-2 space-y-4 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3">
                {/* PATH 1 — some boxes short. Multi-package shipments only: a
                    single-package shipment is either here or it is not, which
                    is the other path. */}
                {shipment.packageList.length > 1 ? (
                  <div>
                    <p className="text-xs font-medium">
                      Which {unit.many} are on the floor?
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Untick anything that did not arrive.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {shipment.packageList.map((pkg) => {
                        const on = present.includes(pkg.id);
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setPresent((current) =>
                                current.includes(pkg.id)
                                  ? current.filter((id) => id !== pkg.id)
                                  : [...current, pkg.id]
                              )
                            }
                            className={`inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-semibold tabular transition-colors ${
                              on
                                ? "border-brand bg-brand/10 text-brand"
                                : "border-dashed border-destructive/50 text-destructive line-through"
                            }`}
                          >
                            {pkg.sequence}
                          </button>
                        );
                      })}
                    </div>

                    <form action={action} className="mt-3">
                      <input type="hidden" name="batchId" value={batchId} />
                      <input
                        type="hidden"
                        name="shipmentId"
                        value={shipment.id}
                      />
                      <input type="hidden" name="result" value="VERIFIED" />
                      <input
                        type="hidden"
                        name="packageSelection"
                        value="explicit"
                      />
                      {shipment.packageList.map((pkg) => (
                        <input
                          key={pkg.id}
                          type="hidden"
                          name="packageIds"
                          value={present.includes(pkg.id) ? pkg.id : ""}
                        />
                      ))}
                      <SubmitButton
                        variant="brand"
                        pendingLabel="Recording…"
                        className="h-11 w-full text-sm sm:w-auto"
                        disabled={present.length === shipment.packageList.length}
                      >
                        <Check className="mr-1.5 h-4 w-4" />
                        Check in {present.length} of{" "}
                        {shipment.packageList.length}
                      </SubmitButton>
                      {present.length < shipment.packageList.length ? (
                        <p className="mt-2 text-xs text-warning">
                          {shipment.packageList.length - present.length} missing
                          — this raises a shortage and blocks release until they
                          arrive.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Untick a {unit.one} above to record it short.
                        </p>
                      )}
                    </form>

                    <div className="mt-4 border-t pt-3 text-xs font-medium">
                      Or the cargo is damaged / wrong
                    </div>
                  </div>
                ) : null}

                {/* PATH 2 — damaged, wrong, or the whole shipment absent. */}
                <form action={action} className="space-y-3">
                  <input type="hidden" name="batchId" value={batchId} />
                  <input type="hidden" name="shipmentId" value={shipment.id} />
                  <input type="hidden" name="result" value="EXCEPTION" />

                  <div className="space-y-1.5">
                    <Label htmlFor={`type-${shipment.id}`} className="text-xs">
                      What is wrong?
                    </Label>
                    <NativeSelect
                      id={`type-${shipment.id}`}
                      name="exceptionType"
                      defaultValue="DAMAGED_CARGO"
                    >
                      {enumOptions(EXCEPTION_TYPE_LABELS).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`note-${shipment.id}`} className="text-xs">
                      Details
                    </Label>
                    <Input
                      id={`note-${shipment.id}`}
                      name="note"
                      placeholder="e.g. one carton torn open, contents wet"
                      required
                    />
                  </div>

                  <SubmitButton
                    size="sm"
                    variant="destructive"
                    pendingLabel="Flagging…"
                  >
                    Record exception
                  </SubmitButton>
                </form>
              </div>
            ) : null}

            <div className="mt-2">
              <FormError state={state} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * What was shipped, so the operator can confirm against the box in front of
 * them rather than against a tracking number.
 *
 * Photos lead because they are the only thing here that settles an argument:
 * Guangzhou photographed six taped cartons, the floor has six taped cartons,
 * done. Everything else is supporting detail. Money is deliberately absent —
 * warehouse users never see what cargo is worth or what it cost.
 *
 * Rendered only while open, so the ninety-row list stays a ninety-row list.
 */
function CargoDetail({ id, shipment }: { id: string; shipment: Row }) {
  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;

  const facts = [
    {
      label: "Counted as",
      value: formatPackages(shipment.packages, shipment.packageType),
    },
    { label: "Declared weight", value: formatWeight(shipment.weightKg) },
    { label: "Goods", value: GOODS_TYPE_LABELS[shipment.goodsType] },
    { label: "Origin", value: ORIGIN_LABELS[shipment.origin] },
    { label: "Carton in China", value: shipment.cartonRef ?? "—" },
    { label: "Phone", value: shipment.customerPhone ?? "No phone recorded" },
  ];

  return (
    <div id={id} className="mt-3 space-y-4 border-t pt-3">
      {/* Photos — the comparison that actually confirms the cargo */}
      {shipment.photos.length > 0 ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            Photographed in {ORIGIN_LABELS[shipment.origin]}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {shipment.photos.map((photo) => (
              <li key={photo.id}>
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring block overflow-hidden rounded-lg border"
                  title={photo.caption ?? "Open full size"}
                >
                  {/* Remote Blob URLs from a host list that keeps growing; a
                      plain img avoids configuring a loader for each one. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption ?? `${shipment.trackingNumber} in China`}
                    className="h-24 w-24 object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No photos were taken in China for this shipment — check the label and
          the {unit.one} count instead.
        </p>
      )}

      <div>
        <p className="text-xs text-muted-foreground">Description</p>
        <p className="mt-0.5 text-sm">{shipment.description}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="truncate text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* The physical boxes. The gap between ticked and not is the shortage. */}
      {shipment.packageList.length > 0 ? (
        <div>
          <p className="text-xs font-medium">
            {shipment.packageList.filter((pkg) => pkg.received).length} of{" "}
            {formatPackages(shipment.packageList.length, shipment.packageType)}{" "}
            checked in
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {shipment.packageList.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {pkg.received ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed" />
                  )}
                  <span className="shrink-0 text-sm tabular">
                    {unit.one.charAt(0).toUpperCase() + unit.one.slice(1)}{" "}
                    {pkg.sequence} of {shipment.packageList.length}
                  </span>
                  <span className="code-chip shrink-0">{pkg.reference}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular">
                  {pkg.weightLabel ?? "no separate weight"}
                  {pkg.received ? "" : " · not checked in"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shipment.internalNote ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-medium text-warning">
            Note from China — never shown to the customer
          </p>
          <p className="mt-1 text-sm">{shipment.internalNote}</p>
        </div>
      ) : null}
    </div>
  );
}

function CompleteButton({
  batchId,
  disabled,
}: {
  batchId: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    completeVerification,
    { ok: true }
  );

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton
        variant="brand"
        size="sm"
        disabled={disabled}
        pendingLabel="Closing…"
      >
        <CheckCheck className="mr-1.5 h-4 w-4" />
        Finish check-in
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
