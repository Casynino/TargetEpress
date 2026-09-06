"use client";

import Link from "next/link";
import { useActionState, useId, useState, useTransition } from "react";
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
import { useLocale, useT } from "@/components/app/locale-provider";
import { ReceivingOutcomePanel } from "@/components/app/receiving-outcome-panel";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  completeVerification,
  verifyBatchAll,
  verifyShipment,
} from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import {
  GOODS_TYPE_LABELS,
  ORIGIN_LABELS,
  PACKAGE_TYPE_LABELS,
  formatPackages,
  formatPackagesShort,
} from "@/lib/constants";
import { formatWeight } from "@/lib/format";
import { pickText, type Locale } from "@/lib/locale";

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
  /** The renderings of `description`, so a Dar clerk never reads 手机配件. */
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  goodsType: GoodsType;
  origin: Origin;
  cartonRef: string | null;
  internalNote: string | null;
  internalNoteEn?: string | null;
  internalNoteZh?: string | null;
  status: ShipmentStatus;
  verification: { result: string; note: string | null } | null;
};

/**
 * The cargo description as this reader should see it.
 *
 * The server parent may hand the text down already resolved, in which case the
 * rendering columns are absent and `pickText` falls through to it. Either way
 * the box is never blank and never in the other desk's language.
 */
function cargoDescription(locale: Locale, shipment: Row) {
  return pickText(locale, shipment.description, {
    en: shipment.descriptionEn,
    zh: shipment.descriptionZh,
  });
}

function cargoNote(locale: Locale, shipment: Row) {
  return pickText(locale, shipment.internalNote, {
    en: shipment.internalNoteEn,
    zh: shipment.internalNoteZh,
  });
}

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
  photosDurable,
}: {
  batchId: string;
  batchStatus: BatchStatus;
  shipments: Row[];
  /** False when photo storage is local disk — the panel says so rather than
      letting somebody photograph damage into a folder that will not survive. */
  photosDurable: boolean;
}) {
  const t = useT();
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
            {checked} {t("of")} {shipments.length} {t("checked")}
            {flagged > 0 ? ` · ${flagged} ${t("flagged")}` : ""}
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
          <CompleteButton batchId={batchId} remaining={remaining} />
        ) : null}
      </div>

      {/*
        Eleven columns. This is the screen a receiving clerk holds in one hand
        while the other opens cartons, so below md the row becomes a card: the
        two answers as full-width buttons instead of 32px icons, and the column
        headings said inline beside their figures.
      */}
      <ul className="space-y-2 md:hidden">
        {shipments.map((shipment) => (
          <li key={shipment.id}>
            <VerificationCard
              batchId={batchId}
              shipment={shipment}
              locked={batchStatus !== "ARRIVED"}
              photosDurable={photosDurable}
            />
          </li>
        ))}
      </ul>

      {/* The same table the China desk reads, so a person who works both ends
          is looking at one layout. The only additions are the two actions and
          the row expander — check-in is the China cargo list plus a decision. */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">{t("Tracking")}</th>
                <th className="px-3 py-2 font-medium">{t("Customer")}</th>
                <th className="px-3 py-2 font-medium">{t("Goods")}</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">
                  {t("Type")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("Weight")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {t("Counted as")}
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  {t("Proof")}
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  {t("Status")}
                </th>
                <th className="w-24 px-3 py-2 text-center font-medium">
                  {t("Check")}
                </th>
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
                  photosDurable={photosDurable}
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
 * What the row and the card both read the shipment's look from.
 *
 * Untouched rows are deliberately excluded from `investigate`: their boxes read
 * "not received" simply because nobody has checked them in yet, and offering a
 * case link on all eighty-seven of them makes the real ones invisible.
 */
function verificationState(shipment: Row) {
  const flagged = shipment.verification?.result === "EXCEPTION";
  const short = shipment.packageList.filter((pkg) => !pkg.received).length;
  return {
    done: shipment.verification?.result === "VERIFIED",
    flagged,
    short,
    investigate: Boolean(shipment.verification) && (flagged || short > 0),
  };
}

/**
 * One consignment to check in, on a phone.
 *
 * The two answers are the point of the card, so they are the widest thing on
 * it. "Present & correct" was a 32px icon in an eleven-column row — a tap that
 * misses it either opens the detail or hits ⚠ and starts a damage report, which
 * is the worst possible mis-tap on this screen.
 */
function VerificationCard({
  batchId,
  shipment,
  locked,
  photosDurable,
}: {
  batchId: string;
  shipment: Row;
  locked: boolean;
  photosDurable: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyShipment,
    { ok: true }
  );
  const [flagging, setFlagging] = useState(false);
  const [open, setOpen] = useState(false);
  const detailId = useId();

  const { done, flagged, short, investigate } = verificationState(shipment);

  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-soft ${
        done
          ? "border-success/30 bg-success/[0.05]"
          : flagged
            ? "border-destructive/40 bg-destructive/[0.06]"
            : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {done ? (
            <Check className="h-4 w-4 shrink-0 text-success" />
          ) : flagged ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          ) : null}
          <span className="truncate font-mono text-sm font-semibold tabular">
            {shipment.trackingNumber}
          </span>
        </span>
        {flagged ? (
          <Badge variant="destructive">{t("Exception")}</Badge>
        ) : (
          <ShipmentStatusBadge status={shipment.status} />
        )}
      </div>

      <p className="mt-1.5 truncate text-sm">{shipment.customerName}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {cargoDescription(locale, shipment)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular">{formatWeight(shipment.weightKg)}</span>
        <span className="tabular">
          {short > 0 && shipment.verification ? (
            <span className="font-semibold text-warning">
              {shipment.packages - short} {t("of")}{" "}
              {formatPackagesShort(shipment.packages, shipment.packageType, locale)}
            </span>
          ) : (
            formatPackagesShort(shipment.packages, shipment.packageType, locale)
          )}
        </span>
        <span>{t(GOODS_TYPE_LABELS[shipment.goodsType] ?? shipment.goodsType)}</span>
        {shipment.photos.length > 0 ? (
          <span className="flex items-center gap-1 tabular">
            <Camera className="h-3.5 w-3.5" />
            {shipment.photos.length}
          </span>
        ) : null}
      </div>

      {/* The decision. Full width, 48px, with the flag beside it rather than
          under it — one thumb, no scrolling between reading and answering. */}
      {locked ? null : (
        <div className="mt-3 flex items-stretch gap-2">
          <form action={action} className="flex-1">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <input type="hidden" name="outcome" value="RECEIVED" />
            <SubmitButton
              variant={done ? "outline" : "brand"}
              className="h-12 w-full rounded-lg"
            >
              <Check className="mr-2 h-4 w-4" />
              {t("Present & correct")}
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setFlagging((v) => !v)}
            aria-expanded={flagging}
            className="focus-ring inline-flex h-12 min-w-[48px] items-center justify-center rounded-lg border px-4 text-destructive hover:bg-destructive/5"
          >
            <AlertTriangle className="h-5 w-5" />
            <span className="sr-only">
              {t("Something is wrong")} — {shipment.trackingNumber}
            </span>
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailId}
          className="focus-ring inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
              open ? "rotate-90" : ""
            }`}
          />
          {open ? t("Hide cargo detail") : t("Show cargo detail")}
        </button>
        {investigate ? (
          <Link
            href={`/app/exceptions?tracking=${shipment.trackingNumber}`}
            className="focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-3 text-sm font-medium text-destructive hover:bg-destructive/5"
          >
            <Search className="h-3.5 w-3.5" />
            {t("Case")}
          </Link>
        ) : (
          <Link
            href={`/app/cargo/${shipment.trackingNumber}`}
            className="focus-ring inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium text-brand hover:bg-accent"
          >
            {t("Open")}
          </Link>
        )}
      </div>

      {open ? <CargoDetail id={detailId} shipment={shipment} /> : null}

      {flagging && !locked ? (
        <ReceivingOutcomePanel
          batchId={batchId}
          shipmentId={shipment.id}
          trackingNumber={shipment.trackingNumber}
          packageType={shipment.packageType}
          packageList={shipment.packageList}
          photosDurable={photosDurable}
          action={action}
        />
      ) : null}

      <div className="mt-2">
        <FormError state={state} />
      </div>
    </div>
  );
}

function VerificationRow({
  batchId,
  shipment,
  locked,
  photosDurable,
}: {
  batchId: string;
  shipment: Row;
  locked: boolean;
  photosDurable: boolean;
}) {
  const t = useT();
  const locale = useLocale();
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

  // Anything flagged, or checked in short, now lives in the investigation
  // queue. The row it was flagged on is where somebody stands when they ask
  // "and where did that carton go?", so the answer is one click from here.
  const { done, flagged, short, investigate } = verificationState(shipment);

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
              {open ? t("Hide cargo detail") : t("Show cargo detail")}
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
          {cargoDescription(locale, shipment)}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 text-muted-foreground lg:table-cell">
          {t(GOODS_TYPE_LABELS[shipment.goodsType] ?? shipment.goodsType)}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {formatWeight(shipment.weightKg)}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular">
          {short > 0 && shipment.verification ? (
            <span className="font-semibold text-warning">
              {shipment.packages - short} {t("of")}{" "}
              {formatPackagesShort(shipment.packages, shipment.packageType, locale)}
            </span>
          ) : (
            formatPackagesShort(shipment.packages, shipment.packageType, locale)
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
            <Badge variant="destructive">{t("Exception")}</Badge>
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
                {/* The first of the six outcomes, taken in one click because it
                    is the one taken almost every time. The other five live in
                    the panel behind the ⚠. */}
                <input type="hidden" name="outcome" value="RECEIVED" />
                <SubmitButton
                  variant={done ? "outline" : "brand"}
                  size="icon"
                  className="h-8 w-8"
                  title={t("Present & correct")}
                  pendingLabel=""
                >
                  <Check className="h-4 w-4" />
                  <span className="sr-only">
                    {t("Present and correct")} — {shipment.trackingNumber}
                  </span>
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setFlagging((v) => !v)}
                title={t("Something is wrong")}
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/5"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="sr-only">
                  {t("Something is wrong")} — {shipment.trackingNumber}
                </span>
              </button>
            </div>
          )}
        </td>

        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          {investigate ? (
            <Link
              href={`/app/exceptions?tracking=${shipment.trackingNumber}`}
              title={t("Open in Issues & Claims")}
              className="focus-ring inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              <Search className="h-3 w-3" />
              {t("Case")}
            </Link>
          ) : (
            <Link
              href={`/app/cargo/${shipment.trackingNumber}`}
              className="focus-ring text-xs font-medium text-brand hover:underline"
            >
              {t("Open")}
            </Link>
          )}
        </td>
      </tr>

      {/* Everything that is not a column: the China photos, the package list,
          the flag form, and any error. One spanning row so the table keeps its
          alignment. */}
      {/* The note is deliberately not rendered here. A row that unfolds to
          show somebody's typed sentence breaks the scan down the column of
          tracking numbers, which is the one thing this table is for. The badge
          and the Case link carry the fact; the words live in the investigation
          queue and on the cargo page. */}
      {open || flagging || !state.ok ? (
        <tr className="border-t-0">
          <td colSpan={11} className="bg-muted/20 px-3 pb-3 pt-0">
            {open ? <CargoDetail id={detailId} shipment={shipment} /> : null}

            {flagging && !locked ? (
              <ReceivingOutcomePanel
                batchId={batchId}
                shipmentId={shipment.id}
                trackingNumber={shipment.trackingNumber}
                packageType={shipment.packageType}
                packageList={shipment.packageList}
                photosDurable={photosDurable}
                action={action}
              />
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
  const t = useT();
  const locale = useLocale();
  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  // Translated before it is capitalised: "纸箱" has no case, so the same two
  // lines read correctly in both languages.
  const unitOne = t(unit.one);

  const facts = [
    {
      label: t("Counted as"),
      value: formatPackages(shipment.packages, shipment.packageType, locale),
    },
    { label: t("Declared weight"), value: formatWeight(shipment.weightKg) },
    { label: t("Goods"), value: t(GOODS_TYPE_LABELS[shipment.goodsType]) },
    { label: t("Origin"), value: t(ORIGIN_LABELS[shipment.origin]) },
    { label: t("Carton in China"), value: shipment.cartonRef ?? "—" },
    {
      label: t("Phone"),
      value: shipment.customerPhone ?? t("No phone recorded"),
    },
  ];

  return (
    <div id={id} className="mt-3 space-y-4 border-t pt-3">
      {/* Photos — the comparison that actually confirms the cargo */}
      {shipment.photos.length > 0 ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            {t("Photographed in")} {t(ORIGIN_LABELS[shipment.origin])}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {shipment.photos.map((photo) => (
              <li key={photo.id}>
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring block overflow-hidden rounded-lg border"
                  title={photo.caption ?? t("Open full size")}
                >
                  {/* Remote Blob URLs from a host list that keeps growing; a
                      plain img avoids configuring a loader for each one. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={
                      photo.caption ??
                      `${shipment.trackingNumber} ${t("in China")}`
                    }
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
          {t(
            "No photos were taken in China for this cargo — check the label and the"
          )}{" "}
          {unitOne} {t("count instead.")}
        </p>
      )}

      <div>
        <p className="text-xs text-muted-foreground">{t("Description")}</p>
        <p className="mt-0.5 text-sm">{cargoDescription(locale, shipment)}</p>
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
            {shipment.packageList.filter((pkg) => pkg.received).length}{" "}
            {t("of")}{" "}
            {formatPackages(shipment.packageList.length, shipment.packageType, locale)}{" "}
            {t("checked in")}
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
                    {unitOne.charAt(0).toUpperCase() + unitOne.slice(1)}{" "}
                    {pkg.sequence} {t("of")} {shipment.packageList.length}
                  </span>
                  <span className="code-chip shrink-0">{pkg.reference}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular">
                  {pkg.weightLabel ?? t("no separate weight")}
                  {pkg.received ? "" : ` · ${t("not checked in")}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shipment.internalNote ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-medium text-warning">
            {t("Note from China — never shown to the customer")}
          </p>
          <p className="mt-1 text-sm">{cargoNote(locale, shipment)}</p>
        </div>
      ) : null}
    </div>
  );
}

function CompleteButton({
  batchId,
  remaining,
}: {
  batchId: string;
  remaining: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, start] = useTransition();

  /*
    ONE PRESS, ONE QUESTION.

    This was two buttons and two presses: "All 9 present & undamaged" ruled on
    the untouched rows, the page revalidated, and only then did "Finish
    check-in" come out of its disabled state to be pressed again. Two clicks
    for one decision, and a clerk who pressed the first and walked away left
    the flight open with every carton ruled on.

    So the second press is gone and the first is what the dialog asks about.
    Both server actions still run, in the same order and unchanged: verifying
    the rest only ever touches rows nobody has ruled on (`verifications: none`),
    which is what keeps a flagged carton from being overwritten by a clerk
    accepting the remainder. Sequential rather than merged, so neither action's
    own guards move.
  */
  function finish() {
    setError(null);
    start(async () => {
      const body = new FormData();
      body.set("batchId", batchId);
      if (remaining > 0) {
        const accepted = await verifyBatchAll(undefined, body);
        if (!accepted.ok) {
          setError(accepted.error ?? null);
          return;
        }
      }
      const closed = await completeVerification(undefined, body);
      if (!closed.ok) {
        setError(closed.error ?? null);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <CheckCheck className="mr-1.5 h-4 w-4" />
          {t("Finish check-in")}
        </Button>
        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Are you sure?")}</DialogTitle>
            <DialogDescription>
              {t(
                "Confirm that the cargo and packages you have checked are correct and safe to proceed."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Said plainly, because this is the half a clerk forgets: the rows
              nobody touched are being ruled on too, and that is a statement
              about real cartons. Anything already flagged keeps its flag. */}
          {remaining > 0 ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <span className="font-semibold">
                {remaining} {t("not yet checked")}
              </span>{" "}
              {t("will be recorded as present and undamaged.")}
            </p>
          ) : null}

          {error ? (
            <p className="text-xs font-medium text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={running}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={finish}
              disabled={running}
            >
              {running ? t("Closing…") : t("Yes, confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
