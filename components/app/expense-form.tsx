"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronDown, Paperclip, Plus, X, Zap } from "lucide-react";

import {
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { recordExpense } from "@/lib/actions/expenses";
import type { ActionResult } from "@/lib/actions/types";

export type ExpenseAccount = {
  id: string;
  name: string;
  currency: string;
  accountNumber: string | null;
};

export type ExpenseDispatch = { id: string; label: string };
export type QuickExpense = { label: string; category: string };

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Recording what the business spent.
 *
 * The costs an air-cargo operation pays are the same ones every week — fuel,
 * the clearing agent, customs, the warehouse rent — and every one of them was
 * four fields and a category chosen from eighteen. The quick picks fill the
 * description AND the category together, which removes the typing and also
 * stops one cost being filed under three different categories by three
 * different people.
 *
 * The receipt is a first-class field, not something behind a disclosure. A
 * typed amount is a claim; the photo of the receipt is what settles an argument
 * about it in four months, and the moment it is easiest to attach is the moment
 * the cost is being recorded.
 */
export function ExpenseForm({
  categories,
  accounts,
  dispatches,
  quick,
  thresholdUsd,
  rate,
}: {
  categories: { value: string; label: string }[];
  accounts: ExpenseAccount[];
  dispatches: ExpenseDispatch[];
  /** Most-recorded first, then the seeded common costs. */
  quick: QuickExpense[];
  thresholdUsd: number;
  rate: number | null;
}) {
  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });

  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [currency, setCurrency] = useState("TZS");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER");
  const amountRef = useRef<HTMLInputElement>(null);

  const eligible = accounts.filter((a) => a.currency === currency);
  const limit =
    currency === "TZS" && rate
      ? `TSh ${Math.round(thresholdUsd * rate).toLocaleString()}`
      : `USD ${thresholdUsd.toLocaleString()}`;

  /** One tap fills what it is and what kind it is, then asks for the amount. */
  const pick = (item: QuickExpense) => {
    setDescription(item.label);
    setCategory(item.category);
    amountRef.current?.focus();
  };

  if (!open) {
    return (
      <Button variant="brand" className="rounded-lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Record a cost
      </Button>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="font-semibold">Record a cost</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* The usual suspects, one tap each. */}
      {quick.length > 0 ? (
        <div className="border-b bg-muted/30 px-5 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            The usual
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => pick(item)}
                className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  description === item.label
                    ? "border-brand bg-brand text-brand-foreground"
                    : "bg-card hover:bg-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form action={action} className="p-5">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-1.5 lg:col-span-5">
            <Label htmlFor="description" className="text-xs">
              What was it for
            </Label>
            <Input
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fuel, customs, a repair…"
              required
            />
          </div>

          <div className="space-y-1.5 lg:col-span-3">
            <Label htmlFor="expenseAmount" className="text-xs">
              Amount
            </Label>
            <div className="flex gap-2">
              <Input
                id="expenseAmount"
                ref={amountRef}
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                className="min-w-0"
                required
              />
              <NativeSelect
                name="currency"
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-[5.5rem] shrink-0"
              >
                <option value="TZS">TSh</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-1.5 lg:col-span-4">
            <Label htmlFor="expenseAccount" className="text-xs">
              Paid from
            </Label>
            <NativeSelect id="expenseAccount" name="accountId" defaultValue="">
              <option value="">Not paid yet</option>
              {eligible.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-[11px] text-muted-foreground">
              Name it and the cost is paid in one step. Leave it and you choose
              the account when you settle it.
            </p>
          </div>

          <div className="space-y-1.5 lg:col-span-5">
            <Label htmlFor="category" className="text-xs">
              Category
            </Label>
            <NativeSelect
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* First class, not behind a disclosure: the moment the receipt is
              easiest to attach is the moment the cost is being recorded. */}
          <div className="space-y-1.5 lg:col-span-7">
            <Label htmlFor="receipt" className="flex items-center gap-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5" />
              Receipt or photo
            </Label>
            <Input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
          </div>

          <div className="lg:col-span-12">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`}
              />
              {more ? "Fewer details" : "Who was paid, which flight, what date"}
            </button>
          </div>

          {more ? (
            <>
              <div className="space-y-1.5 lg:col-span-4">
                <Label htmlFor="vendor" className="text-xs">
                  Paid to
                </Label>
                <Input id="vendor" name="vendor" placeholder="Who received it" />
              </div>
              <div className="space-y-1.5 lg:col-span-4">
                <Label htmlFor="expenseBatch" className="text-xs">
                  Against a dispatch
                </Label>
                <NativeSelect id="expenseBatch" name="batchId" defaultValue="">
                  <option value="">Not one flight</option>
                  {dispatches.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5 lg:col-span-4">
                <Label htmlFor="incurredAt" className="text-xs">
                  Date
                </Label>
                <Input id="incurredAt" name="incurredAt" type="date" max={TODAY} />
              </div>
            </>
          ) : null}
        </div>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data ? `Recorded ${state.data.expenseNumber}` : null
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <SubmitButton variant="brand" size="sm" pendingLabel="Recording…">
            Record cost
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            Over {limit} waits for the CEO&rsquo;s approval before it can leave
            an account.
          </p>
        </div>
      </form>
    </section>
  );
}
