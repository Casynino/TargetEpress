"use client";

import { useActionState, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  Info,
  MessageCircle,
  Scale,
} from "lucide-react";

import { SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { estimateQuote } from "@/lib/actions/quote";
import type { ActionResult } from "@/lib/actions/types";
import { COMPANY, GOODS_TYPE_LABELS, ORIGIN_LABELS, enumOptions } from "@/lib/constants";
import type { Quote } from "@/lib/pricing";

const METHODS = [
  { value: "AIR_NORMAL", label: "Air cargo — standard", note: "Our usual service" },
  { value: "AIR_EXPRESS", label: "Air cargo — express", note: "Priority on the next flight" },
  { value: "SEA_FREIGHT", label: "Sea freight", note: "Cheaper, much slower" },
];

const BASIS_COPY: Record<string, string> = {
  actual: "Priced on the scale weight of your cargo.",
  volumetric:
    "Priced on volumetric weight — your cargo is bulky for its weight, so the space it takes up costs more than the kilos.",
  minimum: "Priced on this route's minimum billable weight.",
};

export function RateCalculator({
  hasRealRates,
}: {
  hasRealRates: boolean;
}) {
  const [state, action] = useActionState<ActionResult<Quote>, FormData>(
    estimateQuote,
    { ok: true }
  );

  /**
   * Controlled inputs on purpose.
   *
   * useActionState re-renders the form after every submit, and people use this
   * calculator by tweaking one number and recalculating — losing their goods
   * type and service on each attempt would make it useless.
   */
  const [form, setForm] = useState({
    origin: "GUANGZHOU",
    destination: "DAR",
    goodsType: "GENERAL_MERCHANDISE",
    method: "AIR_NORMAL",
    weightKg: "",
    volumeCbm: "",
    quantity: "1",
  });

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const result = state.ok ? state.data : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Inputs */}
      <form action={action} className="panel p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Calculator className="h-5 w-5 text-signal" />
          Maelezo ya mzigo wako
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fill what you know. Volume is optional — add it if your cargo is bulky.
        </p>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="origin">Kutoka / From</Label>
              <NativeSelect id="origin" name="origin" value={form.origin} onChange={set("origin")}>
                {enumOptions(ORIGIN_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">Kwenda / To</Label>
              {/* One destination today. A select rather than static text so the
                  form does not need reworking when a second city opens. */}
              <NativeSelect id="destination" name="destination" value={form.destination} onChange={set("destination")}>
                <option value="DAR">Dar es Salaam</option>
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goodsType">Aina ya mzigo / Goods type</Label>
            <NativeSelect
              id="goodsType"
              name="goodsType"
              value={form.goodsType}
              onChange={set("goodsType")}
            >
              {enumOptions(GOODS_TYPE_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Electronics and cosmetics are priced differently from general goods.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Huduma / Service</Label>
            <NativeSelect id="method" name="method" value={form.method} onChange={set("method")}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="weightKg">Uzito (kg)</Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                placeholder="50"
                value={form.weightKg}
                onChange={set("weightKg")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volumeCbm">
                Volume (CBM){" "}
                <span className="font-normal text-muted-foreground">optional</span>
              </Label>
              <Input
                id="volumeCbm"
                name="volumeCbm"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.30"
                value={form.volumeCbm}
                onChange={set("volumeCbm")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Idadi / Pieces</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.quantity}
                onChange={set("quantity")}
              />
            </div>
          </div>
        </div>

        {!state.ok ? (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <SubmitButton
          variant="signal"
          className="mt-6 w-full rounded-xl"
          pendingLabel="Calculating…"
        >
          Pata bei / Calculate
          <ArrowRight className="ml-2 h-4 w-4" />
        </SubmitButton>
      </form>

      {/* Result */}
      <div className="panel flex flex-col overflow-hidden">
        {!result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
            <Scale className="h-9 w-9 text-muted-foreground/40" />
            <p className="font-medium">Your estimate appears here</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Enter your cargo details and we will show the chargeable weight and
              the working behind the price — not just a number.
            </p>
          </div>
        ) : !result.ok ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <Info className="h-9 w-9 text-warning" />
            <p className="font-medium">No published rate for that</p>
            <p className="max-w-xs text-sm text-muted-foreground">{result.message}</p>
            <Button asChild variant="signal" className="rounded-xl">
              <a
                href={`https://wa.me/${COMPANY.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Ask on WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="border-b bg-brand p-6 text-brand-foreground">
              <p className="text-xs uppercase tracking-widest text-brand-foreground/70">
                Estimated cost
              </p>
              <p className="mt-1 font-display text-4xl font-extrabold tracking-tight tabular">
                {result.currency} {Math.round(result.total).toLocaleString()}
              </p>
              {result.transitDays ? (
                <p className="mt-2 text-sm text-brand-foreground/80">
                  Around {result.transitDays} day
                  {result.transitDays === 1 ? "" : "s"} in transit
                </p>
              ) : null}
            </div>

            {/* Chargeable weight — the number customers argue about, explained */}
            <div className="border-b p-6">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  {
                    label: "Scale weight",
                    value: `${result.actualWeightKg.toFixed(1)} kg`,
                    active: result.basis === "actual",
                  },
                  {
                    label: "Volumetric",
                    value:
                      result.volumetricWeightKg === null
                        ? "—"
                        : `${result.volumetricWeightKg.toFixed(1)} kg`,
                    active: result.basis === "volumetric",
                  },
                  {
                    label: "Chargeable",
                    value: `${result.chargeableWeightKg.toFixed(1)} kg`,
                    active: true,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={
                      item.active
                        ? "rounded-lg border-2 border-signal/40 bg-signal/5 p-3"
                        : "rounded-lg border p-3 opacity-60"
                    }
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold tabular">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {BASIS_COPY[result.basis]}
              </p>
            </div>

            {/* Working */}
            <dl className="divide-y">
              {result.lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-start justify-between gap-4 px-6 py-3.5"
                >
                  <div>
                    <dt className="text-sm font-medium">{line.label}</dt>
                    {line.detail ? (
                      <dd className="mt-0.5 text-xs text-muted-foreground">
                        {line.detail}
                      </dd>
                    ) : null}
                  </div>
                  <dd className="shrink-0 font-mono text-sm font-medium tabular">
                    {result.currency} {Math.round(line.amount).toLocaleString()}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 bg-muted/40 px-6 py-4">
                <dt className="font-display font-semibold">Total</dt>
                <dd className="font-mono text-lg font-bold tabular">
                  {result.currency} {Math.round(result.total).toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="mt-auto space-y-3 p-6">
              {/* Never let a placeholder rate masquerade as a quote. */}
              {result.isPlaceholder || !hasRealRates ? (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This is an <strong>indicative</strong> figure from an
                    unconfirmed rate card. Confirm the price with us before your
                    supplier ships.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Estimate only. Final charges are based on the weight recorded
                  when your cargo is received in China.
                </p>
              )}

              {result.notes ? (
                <p className="text-xs text-muted-foreground">{result.notes}</p>
              ) : null}

              <Button asChild variant="signal" className="w-full rounded-xl">
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
                    `Hello Target Express, I got an estimate of ${result.currency} ${Math.round(result.total).toLocaleString()} for ${result.chargeableWeightKg.toFixed(1)} kg. Please confirm my rate.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Confirm this rate on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
