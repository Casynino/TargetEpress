"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, PackageCheck, ScanLine, Search } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { UnableToLocateForm } from "@/components/app/missing-cargo-report";
import { PhotoCapture } from "@/components/app/photo-capture";
import { QrScanner } from "@/components/app/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { releaseShipment } from "@/lib/actions/delivery";
import type { ActionResult } from "@/lib/actions/types";
import { formatMoney, formatWeight } from "@/lib/format";

type Note = {
  id: string;
  noteNumber: string;
  issuedAt: string;
  amountPaid: number;
  currency: string;
  customerName: string;
  customerPhone: string | null;
  trackingNumber: string;
  packages: number;
  weightKg: number;
  description: string;
  /** Every code printed for this cargo: the shipment's, and one per carton. */
  tokens: string[];
};

/**
 * Which cargo does this scanned string belong to?
 *
 * Labels encode a URL ending /t/<token>; older ones carry a bare token or the
 * TXAC: prefix. Shared by the camera here and by a scan handed over from
 * /app/scan, so both doors resolve a code identically.
 */
function matchNote(notes: Note[], raw: string) {
  const trimmed = raw.trim();
  const token =
    trimmed.match(/\/t\/([A-Za-z0-9_\-%]+)\/?$/)?.[1] ??
    trimmed.replace(/^TXAC:[SP]:/, "");
  const scanned = notes.find((n) =>
    n.tokens.some((t) => t === token || t === decodeURIComponent(token))
  );
  if (scanned) return { note: scanned, viaScan: true };

  // A tracking number identifies the cargo but is not a scan of the box, so it
  // opens the note without satisfying the scan the server verifies.
  const typed = notes.find(
    (n) => n.trackingNumber.toLowerCase() === trimmed.toLowerCase()
  );
  return typed ? { note: typed, viaScan: false } : null;
}

/**
 * Counter workflow: scan the carton, check the receiver, hand it over. One
 * scan. The scan is verified server-side against the note — this UI only
 * collects it.
 */
export function ReleaseWorkbench({
  notes,
  photosDurable,
  initialCode,
}: {
  notes: Note[];
  photosDurable: boolean;
  /**
   * A code already scanned on /app/scan and handed over in the URL.
   *
   * The counter scans once, at whichever screen they happen to be on, and
   * lands here with the cargo already open and the scan already satisfied.
   */
  initialCode?: string;
}) {
  const handover = initialCode ? matchNote(notes, initialCode) : null;
  const [selected, setSelected] = useState<Note | null>(handover?.note ?? null);
  const [query, setQuery] = useState("");
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  /**
   * The code that opened this cargo, carried into the form.
   *
   * Without it the counter scanned at the top of the page to find the customer
   * and then scanned the very same box again inside the form — which is the
   * double scan this whole change exists to remove.
   */
  const [scannedCode, setScannedCode] = useState(
    handover?.viaScan ? initialCode!.trim() : ""
  );

  const filtered = notes.filter((note) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      note.noteNumber.toLowerCase().includes(q) ||
      note.trackingNumber.toLowerCase().includes(q) ||
      note.customerName.toLowerCase().includes(q) ||
      (note.customerPhone ?? "").includes(q)
    );
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section className="rounded-xl border bg-card shadow-soft">
        {/*
          The scan comes first, because the box is what identifies the cargo.

          The counter used to pick a customer off this list and then scan to
          confirm the pick — two identifications of one consignment, where the
          second could only agree with the first and the first could be wrong.
          Now the scan opens the customer. The list stays underneath for the
          times a label is torn, wet or missing, which happens on a warehouse
          floor and should not stop a handover.
        */}
        {/*
          Once a cargo is open, the picker gets out of the way.

          A counter arriving from a scan on another screen was landing on a
          live camera with the release form pushed below it — which reads as
          "scan again", whatever the form underneath already knows. The picker
          returns the moment they finish or choose different cargo.
        */}
        {selected ? (
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium tabular">
                {selected.trackingNumber}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.customerName}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setSelected(null);
                setScannedCode("");
              }}
            >
              Different cargo
            </Button>
          </div>
        ) : (
          <>
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Scan the box</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The customer&apos;s pickup note is for reading — only the box gets
            scanned.
          </p>
          <div className="mt-3">
            <QrScanner
              onResult={(raw) => {
                const hit = matchNote(notes, raw);
                if (hit) {
                  setScanMiss(null);
                  setScannedCode(hit.viaScan ? raw.trim() : "");
                  setSelected(hit.note);
                } else {
                  // Cleared cargo only reaches this list once Finance has
                  // issued a note, so an unmatched scan is usually a shipment
                  // that has not been paid for — say that, not "not found".
                  setScanMiss(
                    "That box is not cleared for collection. It may be unpaid, already collected, or on hold — search for it below."
                  );
                }
              }}
            />
          </div>
          {scanMiss ? (
            <div className="mt-2 rounded-xl border-2 border-destructive/50 bg-destructive/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-destructive/80">
                Payment status
              </p>
              <p className="font-display text-base font-bold leading-tight text-destructive">
                NOT CLEARED — DO NOT RELEASE
              </p>
              <p className="mt-1 text-xs text-destructive/90">{scanMiss}</p>
            </div>
          ) : null}
        </div>

        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Or find it by hand</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Note, tracking, name or phone"
              className="pl-9"
            />
          </div>
        </div>

        <ul className="max-h-[560px] divide-y overflow-y-auto">
          {filtered.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setSelected(note)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium tabular">
                    {note.trackingNumber}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {note.noteNumber}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm">{note.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {note.packages} pkg · {formatWeight(note.weightKg)}
                </p>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              Nothing matches that search.
            </li>
          ) : null}
        </ul>
          </>
        )}
      </section>

      {selected ? (
        <ReleaseForm
          key={selected.id}
          note={selected}
          initialScan={scannedCode}
          photosDurable={photosDurable}
          onDone={() => setSelected(null)}
        />
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed bg-muted/20 p-12 text-center">
          <div>
            <ScanLine className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium">Scan the box to begin</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Read the pickup note to check who they are, then scan the code on
              the carton. It opens their cargo and its payment status.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseForm({
  note,
  photosDurable,
  onDone,
  initialScan = "",
}: {
  note: Note;
  photosDurable: boolean;
  onDone: () => void;
  /** The scan that opened this cargo. Empty when it was found by hand. */
  initialScan?: string;
}) {
  const [state, action] = useActionState<
    ActionResult<{ trackingNumber: string }>,
    FormData
  >(releaseShipment, { ok: true });
  const [scanned, setScanned] = useState(initialScan);

  if (state.ok && state.data?.trackingNumber) {
    return (
      <div className="rounded-xl border border-success/40 bg-card p-10 text-center shadow-soft">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-4 font-display text-xl font-bold">Cargo released</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.data.trackingNumber} has been handed over and marked delivered.
        </p>
        <Button variant="brand" className="mt-6" onClick={onDone}>
          Next customer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <form action={action} className="space-y-6 rounded-xl border bg-card p-6 shadow-soft">
      <input type="hidden" name="pickupNoteId" value={note.id} />
      <input type="hidden" name="shipmentQr" value={scanned} />

      <header className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xl font-bold tabular">
              {note.trackingNumber}
            </p>
            <p className="mt-0.5 text-sm">{note.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {note.customerPhone ?? "No phone recorded"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm tabular">{note.noteNumber}</p>
            <p className="text-xs text-muted-foreground">
              Paid {formatMoney(note.amountPaid, note.currency)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {note.packages} package(s) · {formatWeight(note.weightKg)} ·{" "}
          {note.description}
        </p>

        {/*
          The money question, answered before anything else.

          Everything on this screen arrived here because Finance issued a
          pickup note, and Finance issues one only once the invoice is settled —
          so cargo that reaches this form is paid, and saying so plainly is what
          lets a clerk hand a box over without going to find someone. The
          opposite case never gets this far: unpaid cargo has no note, so a scan
          of it does not open this form at all. That is the guarantee, and it is
          worth stating in the words the floor uses rather than leaving the
          clerk to infer it from a figure in the corner.
        */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-success/50 bg-success/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success/80">
              Payment status
            </p>
            <p className="font-display text-lg font-bold leading-tight text-success">
              PAID — READY FOR RELEASE
            </p>
          </div>
          <p className="text-right text-xs text-success/80">
            <span className="block font-mono text-sm font-semibold">
              {formatMoney(note.amountPaid, note.currency)}
            </span>
            settled in full
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            {scanned ? "1. Box confirmed" : "1. Scan the box"}
          </h3>
          {scanned ? (
            <div className="rounded-xl border border-success/40 bg-success/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <PackageCheck className="h-4 w-4" />
                Scanned — no need to scan again
              </p>
              {/* The tail of the code, not the whole URL. It is here so a
                  supervisor can tell two labels apart, and "http://…/t/" is
                  the same on every one of them. */}
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {scanned.split("/").pop() || scanned}
              </p>
            </div>
          ) : (
            <QrScanner
              onResult={setScanned}
              label="Point the camera at the QR on the carton"
            />
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">2. Who is collecting?</h3>

          <div className="space-y-1.5">
            <Label htmlFor="receiverName" className="text-xs">
              Receiver name
            </Label>
            <Input
              id="receiverName"
              name="receiverName"
              defaultValue={note.customerName}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="receiverPhone" className="text-xs">
              Receiver phone
            </Label>
            <Input
              id="receiverPhone"
              name="receiverPhone"
              defaultValue={note.customerPhone ?? ""}
              inputMode="tel"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="relationship" className="text-xs">
              Collecting as
            </Label>
            <NativeSelect id="relationship" name="relationship" defaultValue="SELF">
              <option value="SELF">The customer</option>
              <option value="AGENT">Agent / transporter</option>
              <option value="EMPLOYEE">Their employee</option>
              <option value="FAMILY">Family member</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="receiverIdNumber" className="text-xs">
              ID number{" "}
              <span className="text-muted-foreground">
                required when it is not the customer
              </span>
            </Label>
            <Input id="receiverIdNumber" name="receiverIdNumber" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-xs">
              Note
            </Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
        </div>
      </div>

      {/* 3. Proof of handover */}
      <div className="border-t pt-5">
        <h3 className="mb-1 text-sm font-semibold">
          3. Photograph the handover <span className="text-signal">*</span>
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Required. This is your proof the cargo was collected, and what settles
          a dispute later.
        </p>
        <PhotoCapture
          name="photos"
          required
          max={2}
          label="Delivery photo"
          hint="The cargo with the person collecting it, if they agree."
          durable={photosDurable}
        />
      </div>

      <FormError state={state} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton
          variant="brand"
          disabled={!scanned}
          pendingLabel="Releasing…"
        >
          Deliver shipment
        </SubmitButton>
        {!scanned ? (
          <p className="text-xs text-muted-foreground">
            Scan the box first.
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
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
        trackingNumber={note.trackingNumber}
        onReported={onDone}
      />
    </div>
  );
}
