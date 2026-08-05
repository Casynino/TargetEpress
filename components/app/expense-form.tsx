"use client";

import { useActionState, useState } from "react";
import { Receipt } from "lucide-react";

import {
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/app/form-feedback";
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
 * One form, and where possible one action: pick the account it came out of and
 * the cost is recorded AND paid, because that is how it happens — somebody pays
 * the clearing agent and then writes it down. Leaving the account blank records
 * the cost and leaves it waiting, which is the right answer for a bill that has
 * arrived but not been settled.
 */
export function ExpenseForm({
  categories,
  accounts,
  dispatches,
  thresholdUsd,
}: {
  categories: { value: string; label: string }[];
  accounts: ExpenseAccount[];
  dispatches: ExpenseDispatch[];
  thresholdUsd: number;
}) {
  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });

  const [currency, setCurrency] = useState("TZS");
  const eligible = accounts.filter((a) => a.currency === currency);

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Record a cost
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Name the account it came out of and it is paid in one step. Leave it
          blank and the cost waits until somebody settles it.
        </p>
      </div>

      <form action={action} className="space-y-3 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs">
            What was it for
          </Label>
          <Input
            id="description"
            name="description"
            placeholder="Customs clearance on GZ-SHIP-2026-001"
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label htmlFor="vendor" className="text-xs">
              Paid to <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="vendor" name="vendor" placeholder="Who received it" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="expenseAmount" className="text-xs">
              Amount
            </Label>
            <Input
              id="expenseAmount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expenseCurrency" className="text-xs">
              Currency
            </Label>
            <NativeSelect
              id="expenseCurrency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="TZS">TZS</option>
              <option value="USD">USD</option>
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expenseAccount" className="text-xs">
            Paid from{" "}
            <span className="text-muted-foreground">
              (leave blank if not paid yet)
            </span>
          </Label>
          <NativeSelect id="expenseAccount" name="accountId" defaultValue="">
            <option value="">Not paid yet</option>
            {eligible.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.accountNumber ? ` · ${account.accountNumber}` : ""}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Anything over USD {thresholdUsd.toLocaleString()} waits for the
            CEO&rsquo;s approval before it can leave an account, however this is
            filled in.
          </p>
        </div>

        {dispatches.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="expenseBatch" className="text-xs">
              Against a dispatch{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <NativeSelect id="expenseBatch" name="batchId" defaultValue="">
              <option value="">Not tied to one flight</option>
              {dispatches.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Tie a cost to the flight it belongs to and that flight gets a
              profit figure, not just a revenue one.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="incurredAt" className="text-xs">
              Date{" "}
              <span className="text-muted-foreground">(blank for today)</span>
            </Label>
            <Input id="incurredAt" name="incurredAt" type="date" max={TODAY} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receipt" className="text-xs">
              Receipt <span className="text-muted-foreground">(optional)</span>
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
        </div>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data ? `Recorded ${state.data.expenseNumber}` : null
          }
        />
        <SubmitButton size="sm" pendingLabel="Recording…">
          Record cost
        </SubmitButton>
      </form>
    </section>
  );
}
