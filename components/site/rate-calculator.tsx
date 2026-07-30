"use client";

import { useActionState, useState } from "react";
import type { CargoCategory } from "@prisma/client";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  Info,
  MessageCircle,
  Package,
  Plane,
  Scale,
} from "lucide-react";

import { SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { estimateQuote } from "@/lib/actions/quote";
import type { ActionResult } from "@/lib/actions/types";
import {
  AIRPORT_LABELS,
  CATEGORY_EXAMPLES,
  CATEGORY_LABELS,
  METHOD_LABELS,
  ROUTE_FOR_CATEGORY,
} from "@/lib/cargo";
import { COMPANY } from "@/lib/constants";
import type { Quote } from "@/lib/pricing";

const CATEGORIES: CargoCategory[] = [
  "NORMAL_GOODS",
  "ELECTRONICS",
  "LIQUID_SPECIAL",
];

export type CargoTypeOption = { id: string; name: string };

export function RateCalculator({
  typesByCategory,
}: {
  typesByCategory: Record<string, CargoTypeOption[]>;
}) {
  const [state, action] = useActionState<ActionResult<Quote>, FormData>(
    estimateQuote,
    { ok: true }
  );

  // Controlled: useActionState re-renders after each submit, and people use this
  // by tweaking one field and recalculating.
  const [category, setCategory] = useState<CargoCategory>("NORMAL_GOODS");
  const [cargoTypeId, setCargoTypeId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [volumeCbm, setVolumeCbm] = useState("");
  const [quantity, setQuantity] = useState("1");

  const result = state.ok ? state.data : undefined;
  const types = typesByCategory[category] ?? [];
  // Electronics are per-item: the piece count sets the price, weight does not.
  const perItem = category === "ELECTRONICS";
  const route = ROUTE_FOR_CATEGORY[category];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form action={action} className="panel p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Calculator className="h-5 w-5 text-signal" />
          Maelezo ya mzigo wako
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Chagua aina ya mzigo — tutakuambia uwanja wa ndege na bei yenyewe.
        </p>

        <div className="mt-6 space-y-4">
          {/* Category — the only classification decision anyone makes */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Aina ya mzigo / Cargo category</legend>
            <div className="grid gap-2">
              {CATEGORIES.map((option) => {
                const active = category === option;
                return (
                  <label
                    key={option}
                    className={`focus-ring flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                      active ? "border-signal bg-signal/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option}
                      checked={active}
                      onChange={() => {
                        setCategory(option);
                        setCargoTypeId("");
                      }}
                      className="mt-1 h-4 w-4 accent-[hsl(var(--signal))]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {CATEGORY_LABELS[option]}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {CATEGORY_EXAMPLES[option]}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand">
                        <Plane className="h-3 w-3" />
                        {AIRPORT_LABELS[ROUTE_FOR_CATEGORY[option]]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Derived route, shown read-only so the rule is visible */}
          <div className="panel-inset flex items-center gap-2 p-3 text-xs">
            <Plane className="h-4 w-4 shrink-0 text-brand" />
            <span>
              Inatoka <strong>{AIRPORT_LABELS[route]}</strong> — imechaguliwa
              kutokana na aina ya mzigo, sio kwa mkono.
            </span>
          </div>

          {types.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="cargoTypeId">
                Kitu / Item{" "}
                {perItem ? (
                  <span className="font-normal text-signal">required</span>
                ) : (
                  <span className="font-normal text-muted-foreground">optional</span>
                )}
              </Label>
              <NativeSelect
                id="cargoTypeId"
                name="cargoTypeId"
                value={cargoTypeId}
                onChange={(e) => setCargoTypeId(e.target.value)}
                required={perItem}
              >
                <option value="">
                  {perItem ? "Choose the item…" : "Not sure / mixed"}
                </option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </NativeSelect>
              {perItem ? (
                <p className="text-xs text-muted-foreground">
                  Electronics are priced per item, so the weight does not change
                  the cost.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="weightKg">
                Uzito (kg){" "}
                {perItem ? (
                  <span className="font-normal text-muted-foreground">optional</span>
                ) : null}
              </Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder={perItem ? "—" : "15"}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required={!perItem}
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
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volumeCbm">
                CBM <span className="font-normal text-muted-foreground">optional</span>
              </Label>
              <Input
                id="volumeCbm"
                name="volumeCbm"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.30"
                value={volumeCbm}
                onChange={(e) => setVolumeCbm(e.target.value)}
                disabled={perItem}
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
              Pick a category and we will show the departure airport, the pricing
              method and the working behind the figure.
            </p>
          </div>
        ) : !result.ok ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <Info className="h-9 w-9 text-warning" />
            <p className="font-medium">Not priced yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">{result.message}</p>
            <p className="text-xs text-muted-foreground">
              Route would be {AIRPORT_LABELS[result.route]}.
            </p>
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
                {result.currency}{" "}
                {result.total.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-foreground/80">
                <Plane className="h-4 w-4" />
                Departs {AIRPORT_LABELS[result.route]}
              </p>
            </div>

            <dl className="grid gap-px bg-border sm:grid-cols-3">
              {[
                { label: "Pricing method", value: METHOD_LABELS[result.method] },
                {
                  label: "Rate",
                  value: `${result.currency} ${result.rate.toLocaleString()}${
                    result.method === "WEIGHT_BASED" ? "/kg" : " each"
                  }`,
                },
                {
                  label: result.method === "WEIGHT_BASED" ? "Chargeable" : "Pieces",
                  value:
                    result.method === "WEIGHT_BASED"
                      ? `${(result.chargeableWeightKg ?? 0).toFixed(2)} kg`
                      : String(result.quantity),
                },
              ].map((item) => (
                <div key={item.label} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 font-mono text-sm font-medium tabular">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="border-b px-6 py-3 text-xs text-muted-foreground">
              {result.basis}
            </p>

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
                    {result.currency} {line.amount.toFixed(2)}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 bg-muted/40 px-6 py-4">
                <dt className="font-display font-semibold">Total</dt>
                <dd className="font-mono text-lg font-bold tabular">
                  {result.currency} {result.total.toFixed(2)}
                </dd>
              </div>
            </dl>

            <div className="mt-auto space-y-3 p-6">
              <p className="text-xs text-muted-foreground">
                Estimate only. Final charges are based on what is recorded when
                your cargo is received{" "}
                {result.route === "HONG_KONG" ? "in Hong Kong" : "in Guangzhou"}.
              </p>
              {result.notes ? (
                <p className="text-xs text-muted-foreground">{result.notes}</p>
              ) : null}
              <Button asChild variant="signal" className="w-full rounded-xl">
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
                    `Hello Target Express, I got an estimate of ${result.currency} ${result.total.toFixed(2)} for ${CATEGORY_LABELS[category]}${
                      result.cargoTypeName ? ` (${result.cargoTypeName})` : ""
                    }. Please confirm.`
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
