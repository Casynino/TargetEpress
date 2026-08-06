"use client";

import { useActionState, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

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

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Recording what the business spent.
 *
 * Closed until asked for. It was a permanent eight-field column down the side
 * of the page with a paragraph of explanation under half the fields — visible
 * whether or not anybody wanted it, and the loudest thing on a screen whose job
 * is to show what has already been spent.
 *
 * Four fields do the work: what, how much, out of which account, and what kind
 * of cost. Everything else — who was paid, which flight, what date, the receipt
 * — is real but occasional, so it sits behind one line the clerk opens when
 * they need it. Naming the account records AND pays it in one step, because
 * that is how it happens: somebody pays the clearing agent and then writes it
 * down.
 */
export function ExpenseForm({
  categories,
  accounts,
  dispatches,
  thresholdUsd,
  rate,
}: {
  categories: { value: string; label: string }[];
  accounts: ExpenseAccount[];
  dispatches: ExpenseDispatch[];
  thresholdUsd: number;
  /** USD→TSh, for saying the approval limit in the currency being typed. */
  rate: number | null;
}) {
  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });

  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [currency, setCurrency] = useState("TZS");

  const eligible = accounts.filter((a) => a.currency === currency);
  const limit =
    currency === "TZS" && rate
      ? `TSh ${Math.round(thresholdUsd * rate).toLocaleString()}`
      : `USD ${thresholdUsd.toLocaleString()}`;

  if (!open) {
    return (
      <Button
        variant="brand"
        className="rounded-lg"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Record a cost
      </Button>
    );
  }

  return (
    <section className="rounded-xl border bg-card shadow-soft">
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

      <form action={action} className="p-5">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-1.5 lg:col-span-5">
            <Label htmlFor="description" className="text-xs">
              What was it for
            </Label>
            <Input
              id="description"
              name="description"
              placeholder="Customs clearance, GZ-SHIP-2026-001"
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
          </div>

          <div className="space-y-1.5 lg:col-span-5">
            <Label htmlFor="category" className="text-xs">
              Category
            </Label>
            <NativeSelect id="category" name="category" defaultValue="OTHER">
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Real, but not every time. One line rather than four fields and
              four paragraphs sitting there whether or not they are wanted. */}
          <div className="lg:col-span-7">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="focus-ring mt-6 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`}
              />
              {more ? "Fewer details" : "Who, which flight, date, receipt"}
            </button>
          </div>

          {more ? (
            <>
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="vendor" className="text-xs">
                  Paid to
                </Label>
                <Input id="vendor" name="vendor" placeholder="Who received it" />
              </div>
              <div className="space-y-1.5 lg:col-span-3">
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
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="incurredAt" className="text-xs">
                  Date
                </Label>
                <Input
                  id="incurredAt"
                  name="incurredAt"
                  type="date"
                  max={TODAY}
                />
              </div>
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="receipt" className="text-xs">
                  Receipt
                </Label>
                <Input
                  id="receipt"
                  name="receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  className="file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                />
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
          {/* The one rule worth stating, in the currency being typed. */}
          <p className="text-xs text-muted-foreground">
            Over {limit} waits for the CEO&rsquo;s approval before it can leave
            an account.
          </p>
        </div>
      </form>
    </section>
  );
}
