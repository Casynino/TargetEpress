"use client";

import { useActionState, useRef, useState } from "react";
import { CloudUpload, FileText, Paperclip, X } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { submitPaymentForVerification } from "@/lib/actions/collections";
import type { ActionResult } from "@/lib/actions/types";

const METHODS = [
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
];

/**
 * Handing a customer's payment up to Finance.
 *
 * Everything the system already knows is shown and not asked for: the customer,
 * the cargo, the bill, what is outstanding. The desk types the reference off
 * the customer's message and attaches what they sent. That is the whole form.
 *
 * The amount is pre-filled with the outstanding balance because that is what a
 * customer settling a bill almost always sends, and left editable because
 * part-payments happen. It is the one figure worth a second look, so it is the
 * one field that is not read-only.
 *
 * This desk never says money arrived — only that a customer says it did.
 */
export function RecordCollectionForm({
  invoiceId,
  invoiceNumber,
  customerName,
  trackingNumber,
  goods,
  outstanding,
  currency,
  rate,
}: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  trackingNumber: string;
  goods: string;
  /** In the invoice's currency. */
  outstanding: number;
  currency: string;
  rate: number | null;
}) {
  const [state, action] = useActionState<
    ActionResult<{ submissionNumber: string }>,
    FormData
  >(submitPaymentForVerification, { ok: true });

  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * A customer paying a dollar bill sends shillings, so shillings are the
   * default and the figure is converted for them. Nobody at this desk should
   * be doing arithmetic while a customer is on the phone.
   */
  const [currencyChoice, setCurrencyChoice] = useState(rate ? "TZS" : currency);
  const suggested =
    currencyChoice === currency
      ? outstanding
      : currencyChoice === "TZS" && rate
        ? Math.round(outstanding * rate)
        : outstanding;
  const [amount, setAmount] = useState(String(suggested));

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((current) => [...current, ...Array.from(incoming)]);
  };

  // The file input is the source of truth on submit, so the drop zone writes
  // into it rather than keeping a second list the form cannot see.
  const syncInput = (next: File[]) => {
    if (!inputRef.current) return;
    const bag = new DataTransfer();
    next.forEach((file) => bag.items.add(file));
    inputRef.current.files = bag.files;
  };

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={() => syncInput(files)}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {/* Already known. Shown so the desk can check they are on the right
          record, never retyped. */}
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
        {[
          { label: "Customer", value: customerName },
          { label: "Cargo", value: `${trackingNumber} · ${goods}` },
          { label: "Bill", value: invoiceNumber },
          {
            label: "Outstanding",
            value: `${currency} ${outstanding.toFixed(2)}${
              rate ? ` · TSh ${Math.round(outstanding * rate).toLocaleString("en-US")}` : ""
            }`,
          },
        ].map((fact) => (
          <div key={fact.label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="collectionAmount" className="text-xs">
            What the customer sent
          </Label>
          <MoneyInput
            id="collectionAmount"
            name="amount"
            value={amount}
            onValueChange={setAmount}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collectionCurrency" className="text-xs">
            In
          </Label>
          <NativeSelect
            id="collectionCurrency"
            name="currency"
            value={currencyChoice}
            onChange={(event) => {
              const next = event.target.value;
              setCurrencyChoice(next);
              setAmount(
                String(
                  next === currency
                    ? outstanding
                    : next === "TZS" && rate
                      ? Math.round(outstanding * rate)
                      : outstanding
                )
              );
            }}
            className="h-11 w-[6.5rem]"
          >
            <option value="TZS">TSh</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collectionMethod" className="text-xs">
            How
          </Label>
          <NativeSelect id="collectionMethod" name="method" className="h-11">
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="collectionReference" className="text-xs">
          Reference from the customer
        </Label>
        <Input
          id="collectionReference"
          name="reference"
          placeholder="The M-Pesa code, slip number or cheque number"
          className="h-11"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          The one thing that is not already in the system. Finance checks the
          money against this.
        </p>
      </div>

      {/* The evidence. A submission without it is refused by the action, so it
          is given the room that importance deserves rather than being a row of
          small print at the bottom. */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5" />
          What the customer sent you
        </Label>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = Array.from(event.dataTransfer.files);
            const next = [...files, ...dropped];
            setFiles(next);
            syncInput(next);
          }}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-brand bg-brand/5" : "border-border bg-muted/20"
          }`}
        >
          <CloudUpload className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            Drop the screenshot or slip here
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="focus-ring rounded font-medium text-brand hover:underline"
            >
              choose a file
            </button>
          </p>
          <input
            ref={inputRef}
            id="collectionProof"
            name="proof"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="sr-only"
            onChange={(event) => addFiles(event.target.files)}
          />
        </div>

        {files.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => {
                    const next = files.filter((_, i) => i !== index);
                    setFiles(next);
                    syncInput(next);
                  }}
                  className="focus-ring rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="collectionNote" className="text-xs">
          Anything Finance should know{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="collectionNote"
          name="note"
          placeholder="e.g. paid in two transfers, second one tomorrow"
          className="h-11"
        />
      </div>

      <FormError state={state} />
      <FormSuccess
        message={
          state.ok && state.data
            ? `${state.data.submissionNumber} is with Finance. You will see it move once they check it.`
            : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton variant="brand" pendingLabel="Sending…">
          Submit to Finance
        </SubmitButton>
        <p className="text-xs text-muted-foreground">
          Nothing is settled until Finance verifies it. No money moves on this
          screen.
        </p>
      </div>
    </form>
  );
}
