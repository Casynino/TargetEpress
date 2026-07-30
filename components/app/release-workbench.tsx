"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, PackageCheck, ScanLine, Search } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
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
};

/**
 * Counter workflow: pick the pickup note, scan the actual carton, capture who
 * is taking it. The scan is verified server-side against the note — this UI
 * only collects it.
 */
export function ReleaseWorkbench({ notes }: { notes: Note[] }) {
  const [selected, setSelected] = useState<Note | null>(null);
  const [query, setQuery] = useState("");

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
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Cleared for collection</h2>
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
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                  selected?.id === note.id ? "bg-brand/5" : ""
                }`}
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
      </section>

      {selected ? (
        <ReleaseForm key={selected.id} note={selected} onDone={() => setSelected(null)} />
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed bg-muted/20 p-12 text-center">
          <div>
            <ScanLine className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium">Pick a pickup note to begin</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Choose the customer&apos;s note from the list, then scan the cargo
              label to confirm you are handing over the right box.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseForm({ note, onDone }: { note: Note; onDone: () => void }) {
  const [state, action] = useActionState<
    ActionResult<{ trackingNumber: string }>,
    FormData
  >(releaseShipment, { ok: true });
  const [scanned, setScanned] = useState("");

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
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">1. Scan the cargo label</h3>
          {scanned ? (
            <div className="rounded-xl border border-success/40 bg-success/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <PackageCheck className="h-4 w-4" />
                Label captured
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {scanned}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setScanned("")}
              >
                Scan a different label
              </Button>
            </div>
          ) : (
            <QrScanner
              onResult={setScanned}
              label="Point the camera at the label on the carton"
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

      <FormError state={state} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton
          variant="brand"
          disabled={!scanned}
          pendingLabel="Releasing…"
        >
          Release cargo
        </SubmitButton>
        {!scanned ? (
          <p className="text-xs text-muted-foreground">
            Scan the cargo label first.
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
