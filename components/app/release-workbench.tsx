"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  PackageCheck,
  ScanLine,
  Search,
  TriangleAlert,
} from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import {
  ReportMissingCargoForm,
  UnableToLocateForm,
} from "@/components/app/missing-cargo-report";
import { PhotoCapture } from "@/components/app/photo-capture";
import { QrScanner } from "@/components/app/qr-scanner";
import { ScanVerdict } from "@/components/app/scan-verdict";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  resolveScan,
  resolveScanByNote,
  type ScanResult,
} from "@/lib/actions/scan";
import { releaseShipment } from "@/lib/actions/delivery";
import type { ActionResult } from "@/lib/actions/types";
import { formatMoney, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShipmentStatus } from "@prisma/client";

/**
 * A cleared consignment, for the by-hand list only.
 *
 * The list is the fallback for cargo whose label AND whose customer's printed
 * pickup note are both unreadable — rare, because either code opens the same
 * cargo. Picking from it identifies the customer; it does not prove the box is
 * on the counter, so that path still asks for a scan before anything is
 * handed over.
 */
/**
 * How the clerk got to this cargo, which decides what still has to be proved.
 *
 *  - `scan`     the camera read the carton (or the customer's printed note)
 *  - `queue`    picked off the pickup queue or an inventory row — can scan, so
 *               is asked to
 *  - `noLabel`  picked from the unreadable-label fallback, where scanning is
 *               impossible and the handover photo carries the proof
 */
type Opened = "scan" | "queue" | "noLabel";

type Note = {
  id: string;
  noteNumber: string;
  customerName: string;
  trackingNumber: string;
  packages: number;
  weightKg: number;
};

/**
 * The Dar counter, on one screen.
 *
 * A clerk scans the sticker on a carton with the customer in front of them.
 * From that single scan they can finish the handover or see exactly why they
 * cannot — there is no detail page in between and nothing to navigate to
 * afterwards. Everything below is ordered for that moment on a phone held in
 * one hand:
 *
 *   1. the verdict — may I hand this over, answered before any scrolling
 *   2. who and what — the facts the clerk reads back to the customer
 *   3. the handover itself — receiver, photograph, release
 *
 * The scan resolves on the server, so the screen knows about payment, missing
 * cartons and open investigations, not merely whether a pickup note exists.
 */
export function ReleaseWorkbench({
  notes,
  photosDurable,
  initial,
  initialCode,
  initialError,
}: {
  notes: Note[];
  photosDurable: boolean;
  /** Resolved on the server from ?code= / ?note= / ?open=. */
  initial?: ScanResult | null;
  /** The raw code that produced `initial` — set only for a genuine scan. */
  initialCode?: string;
  /** Why the code in the URL resolved to nothing. */
  initialError?: string | null;
}) {
  const [target, setTarget] = useState<ScanResult | null>(initial ?? null);
  /**
   * The code that opened this cargo, or "" when it was opened by hand.
   *
   * Empty means nobody has proved the box is on the counter, and the form asks
   * for a scan before it will release anything.
   */
  const [scanned, setScanned] = useState(initial ? (initialCode ?? "") : "");
  const [opened, setOpened] = useState<Opened>(
    initial && !initialCode ? "queue" : "scan"
  );
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();
  const t = useT();

  const open = useCallback((code: string, how: Opened) => {
    setError(null);
    startTransition(async () => {
      const response =
        how === "noLabel"
          ? await resolveScanByNote(code)
          : await resolveScan(code);
      if (response.ok && response.data) {
        /*
          Every route submits a code the server re-resolves and re-checks; what
          differs is whether a human read it off the box.

          A camera read proves the carton is on the counter. A pick from the
          pickup queue does not, so that path is asked to scan. The unreadable-
          label fallback cannot scan by definition — that is the whole reason
          somebody is in it — so it releases on the strength of the mandatory
          handover photograph instead, and says so in as many words.
        */
        setOpened(how);
        setScanned(how === "scan" ? code.trim() : "");
        setTarget(response.data);
      } else {
        setTarget(null);
        setScanned("");
        setOpened("scan");
        setError(response.ok ? t("No cargo matches that code.") : response.error);
      }
    });
  }, [t]);

  const reset = useCallback(() => {
    setTarget(null);
    setScanned("");
    setOpened("scan");
    setError(null);
    /*
      Drop the code out of the URL along with the cargo it opened.

      Without this the address bar still names the customer who just collected,
      so a refresh — or a phone waking the tab up — reopens their consignment
      with their name and number already typed into the receiver fields, ready
      to be released to whoever is standing there now. replaceState rather than
      a router push: this is tidying an address, not a navigation, and it must
      not add a back-button step that walks the clerk into the same trap.
    */
    window.history.replaceState(null, "", "/app/release");
  }, []);

  if (pending) {
    return (
      <div className="panel flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <span className="ml-3 text-sm text-muted-foreground">
          {t("Reading the label…")}
        </span>
      </div>
    );
  }

  if (target) {
    return (
      <ReleaseScreen
        key={target.shipmentId}
        target={target}
        scanned={scanned}
        opened={opened}
        onScan={setScanned}
        /* The label on the carton is torn, soaked or was never legible. The
           counter is already holding the box; what it cannot do is read it. */
        onNoLabel={() => setOpened("noLabel")}
        photosDurable={photosDurable}
        onDone={reset}
      />
    );
  }

  return <ScanPrompt notes={notes} error={error} onOpen={open} />;
}

/* ------------------------------------------------------------------ */
/* Nothing scanned yet                                                  */
/* ------------------------------------------------------------------ */

function ScanPrompt({
  notes,
  error,
  onOpen,
}: {
  notes: Note[];
  error: string | null;
  onOpen: (code: string, how: Opened) => void;
}) {
  const [query, setQuery] = useState("");
  const [byHand, setByHand] = useState(false);
  const t = useT();

  const filtered = notes.filter((note) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      note.noteNumber.toLowerCase().includes(q) ||
      note.trackingNumber.toLowerCase().includes(q) ||
      note.customerName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="panel p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-brand" />
          <h2 className="font-display text-lg font-bold">{t("Scan the box")}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "The sticker on the carton, or the code on the customer's printed pickup note — either one opens their cargo."
          )}
        </p>
        <div className="mt-4">
          <QrScanner onResult={(raw) => onOpen(raw, "scan")} />
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border-2 border-destructive/50 bg-destructive/10 p-3">
            <p className="font-display text-base font-bold leading-tight text-destructive">
              {t("Not read")}
            </p>
            <p className="mt-1 text-xs text-destructive/90">{error}</p>
          </div>
        ) : null}
      </div>

      {/*
        The fallback, kept quiet.

        Both the carton sticker and the customer's printed note resolve to the
        same cargo, so a clerk needs this only when neither can be read at all.
        Behind a disclosure so it does not compete with the scanner, which is
        what this screen is for.
      */}
      <div className="panel p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setByHand((v) => !v)}
          className="focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4 text-muted-foreground" />
            {t("Label unreadable? Find it by hand")}
          </span>
          <span className="text-xs text-muted-foreground">
            {notes.length} {t("cleared")}
          </span>
        </button>

        {byHand ? (
          <div className="mt-4 space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "No cargo is cleared for release right now. Finance issues a pickup note once cargo is paid for."
                )}
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("Tracking, note number or name")}
                    className="h-11 pl-9"
                  />
                </div>
                <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                  {filtered.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(note.id, "noLabel")}
                        className="focus-ring w-full rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold tabular">
                            {note.trackingNumber}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground tabular">
                            {note.noteNumber}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm">
                          {note.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {note.packages} {t("pkg")} ·{" "}
                          {formatWeight(note.weightKg)}
                        </p>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 ? (
                    <li className="p-2 text-sm text-muted-foreground">
                      {t("Nothing matches that search.")}
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scanned — the whole job                                              */
/* ------------------------------------------------------------------ */

function ReleaseScreen({
  target,
  scanned,
  opened,
  onScan,
  onNoLabel,
  photosDurable,
  onDone,
}: {
  target: ScanResult;
  scanned: string;
  opened: Opened;
  onScan: (code: string) => void;
  onNoLabel: () => void;
  photosDurable: boolean;
  onDone: () => void;
}) {
  const [released, setReleased] = useState<string | null>(null);
  const t = useT();

  /*
    The confirmation replaces the screen rather than sitting under it.

    It used to swap only the form, leaving a green "Cleared — hand it over" and
    the full cargo record above — so a clerk who thumbed back up after handing a
    box over saw a screen identical to the one that told them to hand it over.
  */
  if (released) {
    return (
      <div className="mx-auto max-w-3xl">
        <ReleasedPanel trackingNumber={released} onDone={onDone} />
      </div>
    );
  }

  /*
    "Cleared" with a dead button is worse than a plain refusal.

    Cargo reached from the pickup queue is genuinely clear — the server says so
    — but the box has not been read yet, and the verdict knows nothing about
    that. A clerk who reads GO, fills the form and finds the button dead has
    been walked into it. Say what is outstanding, at the top, where the answer
    to "can I hand this over" lives.
  */
  const waitingOnScan = target.canRelease && !scanned && opened === "queue";
  const verdict = waitingOnScan
    ? {
        tone: "warn" as const,
        headline: t("Cleared — now scan the box"),
        detail: t(
          "Payment and paperwork are in order. Read the QR on the carton to confirm you have the right one, then hand it over."
        ),
      }
    : target.verdict;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 1. May I hand this over? First thing on the screen, every time. */}
      <ScanVerdict
        tone={verdict.tone}
        headline={verdict.headline}
        detail={verdict.detail}
      />

      <CargoFacts target={target} onDone={onDone} />

      {target.canRelease && target.pickupNote ? (
        <ReleaseForm
          target={target}
          note={target.pickupNote}
          scanned={scanned}
          opened={opened}
          onScan={onScan}
          onNoLabel={onNoLabel}
          photosDurable={photosDurable}
          onDone={onDone}
          onReleased={setReleased}
        />
      ) : (
        <BlockedActions target={target} onDone={onDone} />
      )}
    </div>
  );
}

/**
 * Who the cargo belongs to and what it is.
 *
 * The clerk reads this back to the customer before anything moves, so it
 * carries the things a person can check standing there: the name, the phone
 * number they were called on, how many boxes are actually on the floor, and
 * which packing carton to look inside. Money is the note's figure, which is
 * the document the customer is holding — not the invoice, which this desk
 * does not see.
 */
function CargoFacts({
  target,
  onDone,
}: {
  target: ScanResult;
  onDone: () => void;
}) {
  const note = target.pickupNote;
  const t = useT();

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-6">
        <div className="min-w-0">
          <p className="font-mono text-xl font-bold tabular">
            {target.trackingNumber}
          </p>
          <p className="mt-1 text-base font-medium">{target.customerName}</p>
          <p className="text-sm text-muted-foreground">
            {target.customerPhone ?? t("No phone recorded")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ShipmentStatusBadge status={target.status as ShipmentStatus} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={onDone}
          >
            {t("Scan another")}
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <Fact
          label={t("Boxes here")}
          value={`${target.progress.received} ${t("of")} ${target.progress.total}`}
          tone={target.progress.complete ? "ok" : "bad"}
          // Which carton is short, wherever it is short. The number used to be
          // named only in the one verdict branch that requires a live pickup
          // note, so a clerk looking at "2 of 3" on unpaid cargo had to open
          // another screen to learn which box to hunt for.
          note={
            target.progress.complete
              ? undefined
              : `${target.progress.missing.map((n) => `#${n}`).join(", ")} ${t("not checked in")}`
          }
        />
        <Fact label={t("Weight")} value={formatWeight(target.weightKg)} />
        <Fact label={t("Packing carton")} value={target.cartonRef ?? "—"} />
        <Fact label={t("Batch")} value={target.batchNumber ?? "—"} />
        <Fact label={t("Arrived in Dar")} value={target.arrivedAt ?? "—"} />
        <Fact
          label={t("Pickup note")}
          value={note ? note.noteNumber : t("Not issued")}
          tone={note?.status === "ACTIVE" ? "ok" : note ? "bad" : undefined}
        />
      </dl>

      <div className="space-y-3 border-t p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Contents")}
          </p>
          <p className="mt-0.5 text-sm">{target.description}</p>
        </div>

        {/*
          The box actually in the clerk's hand, and whether Dar ever receipted
          it. "Boxes here: 2 of 3" and a scanned reference sat on the same
          screen without ever being connected, so a clerk holding the missing
          carton would go and look for it on the shelf.
        */}
        {target.scannedPackage ? (
          <p
            className={cn(
              "text-sm",
              target.scannedPackage.received
                ? "text-muted-foreground"
                : "font-medium text-warning"
            )}
          >
            {t("You scanned box")} {target.scannedPackage.sequence} {t("of")}{" "}
            {target.progress.total} (
            <span className="font-mono">{target.scannedPackage.reference}</span>
            ) —{" "}
            {target.scannedPackage.received
              ? t("checked in at Dar.")
              : t("this one was never checked in at Dar.")}
          </p>
        ) : null}

        {/*
          The invoice, for whoever is allowed to see one.

          Null for the warehouse by permission, so this simply is not there for
          them. It is here because the old scan screen answered "how much is
          still owed on this?" and that screen no longer exists — an owner
          scanning a disputed consignment would otherwise get a red refusal
          with no figure anywhere on it.
        */}
        {target.finance ? (
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("Invoice")} {target.finance.invoiceNumber}
            </p>
            <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("Total")}</dt>
                <dd className="font-mono font-semibold tabular">
                  {formatMoney(target.finance.total, target.finance.currency)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("Paid")}</dt>
                <dd className="font-mono font-semibold tabular">
                  {formatMoney(
                    target.finance.amountPaid,
                    target.finance.currency
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("Outstanding")}</dt>
                <dd
                  className={cn(
                    "font-mono font-semibold tabular",
                    target.finance.outstanding > 0
                      ? "text-destructive"
                      : "text-success"
                  )}
                >
                  {formatMoney(
                    target.finance.outstanding,
                    target.finance.currency
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {note && note.status === "ACTIVE" ? (
          /*
            Only while the note is live.

            Gated on the note merely existing, a collected or cancelled
            consignment showed an amber verdict at the top and a full-width
            green "settled in full" panel underneath — and green is the colour
            that reads as permission across a counter.

            The payment fact, and the figure only for those allowed it.

            The owner's rule is that warehouse staff never see shipping prices,
            so the Dar counter reads "settled in full" and the note that says
            so — which is all it needs to hand a box over. Finance and the CEO
            open the same screen and see the amount. The gate lives on the
            server: the shillings are simply absent from what the browser is
            sent, rather than hidden with a class.
          */
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-success/50 bg-success/10 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success/80">
                {t("Payment")}
              </p>
              <p className="font-display text-lg font-bold leading-tight text-success">
                {note.amountPaid !== undefined && note.currency
                  ? formatMoney(note.amountPaid, note.currency)
                  : t("Settled in full")}
              </p>
            </div>
            <p className="text-right text-xs text-success/80">
              {note.noteNumber}
              <span className="block">
                {t("issued")} {note.issuedAt}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
  /** A second line, for a fact that needs qualifying. */
  note?: string;
}) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 break-words font-mono font-semibold tabular",
          // The box count decides whether a partial shipment goes out of the
          // door, so it is not the same size as the batch number.
          tone ? "text-base" : "text-sm",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </dd>
      {note ? (
        <p className="mt-0.5 text-xs leading-tight text-destructive">
          {note}
        </p>
      ) : null}
    </div>
  );
}

const RELATIONSHIP_WORDS: Record<string, string> = {
  SELF: "the customer",
  AGENT: "agent / transporter",
  EMPLOYEE: "their employee",
  FAMILY: "family member",
};

/**
 * What to do instead, for cargo that cannot go.
 *
 * A refusal with no route out is a screen the clerk has to leave and re-solve
 * somewhere else, with a customer watching. The Dar floor holds
 * `batch.receive` and `exception.raise`, so in most blocked states the fix is
 * one tap away and simply was not offered.
 */
function BlockedActions({
  target,
  onDone,
}: {
  target: ScanResult;
  onDone: () => void;
}) {
  const short = !target.progress.complete;
  const notHereYet =
    target.status !== "READY_FOR_PICKUP" && target.status !== "DELIVERED";
  const t = useT();

  return (
    <div className="panel p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">
        {t(
          "This cargo cannot be released from here. Nothing has been changed."
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Cargo the record has not receipted, with the box in the clerk's
            hand — checking it in is the actual next action. */}
        {short || notHereYet ? (
          <Button asChild variant="signal" className="h-11">
            <Link href="/app/receive">{t("Check the cargo in")}</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-11">
          <Link href={`/app/cargo/${target.trackingNumber}`}>
            {t("Open the cargo")}
          </Link>
        </Button>
        <Button variant="brand" className="h-11" onClick={onDone}>
          {t("Scan another box")}
        </Button>
      </div>

      {/*
        A count that disagrees with the manifest is a case, not a shrug — and
        this is the moment somebody is standing in front of the gap. Its own
        control rather than a link, because it opens an investigation and locks
        the cargo, which is not something to do by following a hyperlink.
      */}
      {short ? (
        <div className="mt-4 border-t pt-4">
          <ReportMissingCargoForm
            shipmentId={target.shipmentId}
            trackingNumber={target.trackingNumber}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Shown alone once the cargo has gone, so nothing still reads "hand it over". */
function ReleasedPanel({
  trackingNumber,
  onDone,
}: {
  trackingNumber: string;
  onDone: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const t = useT();
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="panel border-success/40 p-8 text-center sm:p-10">
      <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="focus-ring mt-4 font-display text-xl font-bold"
      >
        {t("Cargo released")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-mono tabular">{trackingNumber}</span>{" "}
        {t("has been handed over and marked delivered.")}
      </p>
      <Button variant="brand" className="mt-6 h-11" onClick={onDone}>
        {t("Next customer")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The handover                                                         */
/* ------------------------------------------------------------------ */

function ReleaseForm({
  target,
  note,
  scanned,
  opened,
  onScan,
  onNoLabel,
  photosDurable,
  onDone,
  onReleased,
}: {
  target: ScanResult;
  note: NonNullable<ScanResult["pickupNote"]>;
  scanned: string;
  opened: Opened;
  onScan: (code: string) => void;
  onNoLabel: () => void;
  photosDurable: boolean;
  onDone: () => void;
  onReleased: (trackingNumber: string) => void;
}) {
  const [state, action] = useActionState<
    ActionResult<{ trackingNumber: string }>,
    FormData
  >(releaseShipment, { ok: true });

  /**
   * Who is actually taking the box, tracked so the confirmation can name them.
   *
   * The submit button used to read "Release to {customer}" off the customer
   * record, which is the wrong person whenever an agent or an employee
   * collects — the one sentence that could catch a wrong-receiver mistake was
   * confirming something nobody had typed.
   */
  const [receiver, setReceiver] = useState(target.customerName);
  const [relationship, setRelationship] = useState("SELF");
  const t = useT();

  const released = state.ok ? state.data?.trackingNumber : undefined;
  useEffect(() => {
    if (released) onReleased(released);
  }, [released, onReleased]);

  /*
    The fallback releases without a camera read, and says so.

    Reached only from "Label unreadable? Find it by hand" — where a scan is
    impossible by definition. Every server-side guard still runs on submit: the
    code is re-resolved, the note re-checked, the investigation lock re-tested
    and the carton count re-counted inside the transaction. What is missing is
    proof the box is on the counter, and the mandatory handover photograph is
    what carries that instead.
  */
  const scanImpossible = opened === "noLabel";
  const armed = Boolean(scanned) || scanImpossible;

  return (
    <div className="space-y-4">
      <form action={action} className="panel space-y-6 p-4 sm:p-6">
        <input type="hidden" name="pickupNoteId" value={note.id} />
        {/*
          Omitted, not blank, when nothing was scanned.

          An empty string still arrives in the FormData and fails the schema's
          min(1) — `.optional()` skips a missing key, not an empty one. The
          unreadable-label path has to leave the field out altogether so the
          server sees the absence it is designed to handle.
        */}
        {scanned ? (
          <input type="hidden" name="shipmentQr" value={scanned} />
        ) : null}

        {scanImpossible ? (
          <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {t("Releasing without scanning the label")}
            </p>
            <p className="mt-1 text-xs text-warning/90">
              {t(
                "You opened this from the unreadable-label list. Check the tracking number against the customer's paperwork yourself, and make sure the cargo is in the handover photograph — that photo is the only record that the right box left the building."
              )}
            </p>
          </div>
        ) : scanned ? (
          <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/5 p-3">
            <PackageCheck className="h-4 w-4 shrink-0 text-success" />
            <p className="text-sm font-medium text-success">
              {t("Box scanned and confirmed")}
            </p>
          </div>
        ) : (
          <div>
            <h3 className="mb-1 text-sm font-semibold">
              {t("Scan the box to confirm")}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t(
                "You opened this cargo from a list, so the box itself has not been read yet."
              )}
            </p>
            <QrScanner
              onResult={onScan}
              label={t("Point the camera at the QR on the carton")}
            />
            {/*
              The way out, for the box whose label cannot be read.

              This escape already existed, but only on the scan screen — reach
              the same cargo from the pickup queue and there was none, so a
              clerk holding a carton with a soaked label was told to scan it and
              had nowhere to go. Typing the tracking number was the obvious
              guess and it fails, because the code on the sticker is a QR token
              and not the tracking number: "the label is not valid".

              It does not skip a check so much as name what is actually being
              relied on. Nothing here proves the right box is on the counter —
              the row was opened from a list, and a typed number would prove no
              more than that — so the handover photograph becomes the proof, and
              the release is recorded as made without a scan.
            */}
            <button
              type="button"
              onClick={onNoLabel}
              className="focus-ring mt-3 min-h-11 text-left text-xs font-medium text-warning underline underline-offset-2"
            >
              {t("The label cannot be read — release without scanning")}
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("Who is collecting?")}</h3>

          {/*
            SHORT, AND THE CUSTOMER IS STANDING THERE.

            The three figures first, because the clerk has to say them out loud
            to the person in front of them, and then the one thing that makes
            it lawful to hand anything over: that the customer agreed to take
            what arrived. Unticked, the server refuses exactly as it always
            did — this is not a warning, it is the decision.
          */}
          {!target.progress.complete ? (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-warning/80">{t("Booked")}</dt>
                  <dd className="font-semibold tabular-nums text-warning">
                    {target.progress.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-warning/80">{t("Arrived")}</dt>
                  <dd className="font-semibold tabular-nums text-warning">
                    {target.progress.received}
                  </dd>
                </div>
                <div>
                  <dt className="text-warning/80">{t("Difference")}</dt>
                  <dd className="font-semibold tabular-nums text-warning">
                    −{target.progress.total - target.progress.received}
                  </dd>
                </div>
              </dl>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-warning">
                <input
                  type="checkbox"
                  name="partialAccepted"
                  value="1"
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="font-semibold">
                    {t("The customer agreed to take what arrived.")}
                  </span>{" "}
                  {t(
                    "The rest stays owed and the case stays open. They collect it on this same note."
                  )}
                </span>
              </label>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="receiverName" className="text-xs">
              {t("Receiver name")}
            </Label>
            <Input
              id="receiverName"
              name="receiverName"
              className="h-11"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="receiverPhone" className="text-xs">
              {t("Receiver phone")}
            </Label>
            <Input
              id="receiverPhone"
              name="receiverPhone"
              className="h-11"
              defaultValue={target.customerPhone ?? ""}
              inputMode="tel"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="relationship" className="text-xs">
                {t("Collecting as")}
              </Label>
              <NativeSelect
                id="relationship"
                name="relationship"
                className="h-11"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              >
                <option value="SELF">{t("The customer")}</option>
                <option value="AGENT">{t("Agent / transporter")}</option>
                <option value="EMPLOYEE">{t("Their employee")}</option>
                <option value="FAMILY">{t("Family member")}</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiverIdNumber" className="text-xs">
                {t("ID number")}{" "}
                <span className="text-muted-foreground">
                  {relationship === "SELF"
                    ? t("if you checked one")
                    : t("required — someone else is collecting")}
                </span>
              </Label>
              <Input
                id="receiverIdNumber"
                name="receiverIdNumber"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-xs">
              {t("Note")}
            </Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
        </div>

        <div className="border-t pt-5">
          {/*
            "Expected", not "Required *".

            This panel said Required, with a red asterisk, while PhotoCapture
            four lines below it says you can still save without one — and the
            softening below was the deliberate half. releaseCargo will not
            block a handover on a flat battery ("Evidence is expected, never
            enforced", lib/actions/delivery.ts), because a paying customer sent
            away from the counter is strictly worse than a consignment recorded
            without a picture. A clerk who cannot tell which of the two lines
            is true either turns that customer away or learns that this app's
            "Required" labels are decorative, and the second is worse.
          */}
          <h3 className="mb-1 text-sm font-semibold">
            {t("Photograph the handover")}
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {t(
              "Expected. This is your proof the cargo was collected, and what settles a dispute later — you can still save without one."
            )}
          </p>
          <PhotoCapture
            name="photos"
            required
            max={2}
            label={t("Delivery photo")}
            hint={t("The cargo with the person collecting it, if they agree.")}
            durable={photosDurable}
          />
        </div>

        <FormError state={state} />

        <div className="space-y-3 border-t pt-4">
          {/*
            The last sentence before an irreversible tap, and it names the
            person actually typed into the form.

            The button used to read "Release to {customer}" off the customer
            record — the wrong name whenever an agent or an employee collects,
            and a truncation of any company name. The one line that could catch
            a wrong-receiver mistake was confirming something nobody entered.
          */}
          {armed ? (
            <p className="text-sm">
              {t("Handing")}{" "}
              <span className="font-mono font-semibold tabular">
                {target.trackingNumber}
              </span>{" "}
              {t("to")} <span className="font-semibold">{receiver || "—"}</span>
              {relationship !== "SELF" ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({t(RELATIONSHIP_WORDS[relationship])})
                </span>
              ) : null}
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("Scan the box before releasing it.")}
            </p>
          )}
          {/*
            No Cancel beside the submit.

            It ran the same reset as "Scan another" — throwing away the receiver
            details and both handover photographs with no confirmation — from a
            position a thumb reaches for while aiming at Release. The way out is
            still there, at the top of the screen, away from this one.
          */}
          <SubmitButton
            variant="brand"
            className="h-11 w-full sm:w-auto"
            disabled={!armed}
            pendingLabel={t("Releasing…")}
          >
            {t("Release cargo")}
          </SubmitButton>
        </div>
      </form>

      {/*
        The other outcome. Sometimes the record says the cargo is here and the
        shelf says otherwise, and the wrong thing to do then is to mark it
        delivered and sort it out afterwards. Sits outside the release form —
        a form inside a form is invalid, and this must never be submitted by
        the same click as a handover.
      */}
      <UnableToLocateForm
        pickupNoteId={note.id}
        trackingNumber={target.trackingNumber}
        onReported={onDone}
      />
    </div>
  );
}
