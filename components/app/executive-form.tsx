"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";

import {
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordExecutiveEntry } from "@/lib/actions/executive";
import type { ActionResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

const TODAY = new Date().toISOString().slice(0, 10);

export type ExecutiveAccount = {
  id: string;
  name: string;
  currency: string;
};

/**
 * Recording a movement on the executive account.
 *
 * Two directions on one form rather than two forms, because they are the same
 * six fields and the difference is a single choice: money out, or money back.
 * The choice is the first thing on the form and it colours the rest, so nobody
 * records a repayment as a withdrawal by working down a form that looks
 * identical either way.
 *
 * The reason is required. An unexplained withdrawal is the one row an auditor
 * stops on, and the only person who can answer is the one at the desk now.
 */
export function ExecutiveForm({ accounts }: { accounts: ExecutiveAccount[] }) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ entryNumber: string }> | undefined,
    FormData
  >(recordExecutiveEntry, undefined);
  const [direction, setDirection] = useState<"DRAW" | "RETURN">("DRAW");
  const formRef = useRef<HTMLFormElement>(null);

  const draw = direction === "DRAW";

  return (
    <form
      ref={formRef}
      action={action}
      className="overflow-hidden rounded-xl border bg-card shadow-soft"
    >
      <input type="hidden" name="direction" value={direction} />

      {/* Which way the money went, before anything else. */}
      <div className="grid grid-cols-2 gap-px bg-border">
        {[
          {
            key: "DRAW" as const,
            label: t("Money taken out"),
            hint: t("Company money for executive use"),
            icon: ArrowUpRight,
            on: "bg-destructive/10 text-destructive",
          },
          {
            key: "RETURN" as const,
            label: t("Money paid back"),
            hint: t("Against what is owed"),
            icon: ArrowDownLeft,
            on: "bg-success/10 text-success",
          },
        ].map((option) => {
          const active = direction === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setDirection(option.key)}
              aria-pressed={active}
              className={cn(
                "focus-ring flex items-start gap-2.5 bg-card px-5 py-3.5 text-left transition-colors",
                active ? option.on : "hover:bg-accent"
              )}
            >
              <option.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="exec-amount">{t("Amount")}</Label>
            <MoneyInput id="exec-amount" name="amount" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-account">
              {draw ? t("Taken from") : t("Paid back into")}
            </Label>
            <NativeSelect id="exec-account" name="accountId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-date">{t("Date")}</Label>
            <Input
              id="exec-date"
              name="occurredAt"
              type="date"
              defaultValue={TODAY}
              max={TODAY}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exec-reason">{t("Reason")}</Label>
          <Input
            id="exec-reason"
            name="reason"
            required
            placeholder={t("What the money is for")}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Required. This is the line anybody reviewing the account will read first."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="exec-note">
              {t("Notes")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("optional")}
              </span>
            </Label>
            <Input id="exec-note" name="note" placeholder={t("Anything else")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-receipt" className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              {t("Attachment")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("optional")}
              </span>
            </Label>
            <Input id="exec-receipt" name="receipt" type="file" multiple />
          </div>
        </div>

        <FormError state={state} />
        {state?.ok && state.data ? (
          <FormSuccess message={`${t("Recorded")} · ${state.data.entryNumber}`} />
        ) : null}

        <div className="flex items-center gap-3">
          <SubmitButton className={draw ? "" : "bg-success text-white"}>
            {draw ? t("Record the withdrawal") : t("Record the repayment")}
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            {t(
              "Both directions move real cash and are written to the general ledger."
            )}
          </p>
        </div>
      </div>
    </form>
  );
}
