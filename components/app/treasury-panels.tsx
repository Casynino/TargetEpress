"use client";

import { useActionState, useState } from "react";
import { ArrowLeftRight, Calculator, X } from "lucide-react";

import {
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordCashCount, recordTransfer } from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/types";

export type TreasuryAccount = {
  id: string;
  name: string;
  kind: string;
  currency: string;
};

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * "CRDB Bank (TZS)" already says which currency it is. Appending it again reads
 * as a bug to anybody looking at the list, even though it is only a label.
 */
function accountLabel(account: TreasuryAccount) {
  return account.name.includes(account.currency)
    ? account.name
    : `${account.name} (${account.currency})`;
}

/**
 * Banking the cash, funding the tin, moving dollars into shillings.
 *
 * Deliberately not called income or expense anywhere: the business is no richer
 * for banking its own money, and a transfer counted as either would inflate
 * both sides of the books at once.
 */
export function TransferPanel({ accounts }: { accounts: TreasuryAccount[] }) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ transferNumber: string }>,
    FormData
  >(recordTransfer, { ok: true });

  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");

  const fromAccount = accounts.find((a) => a.id === from);
  const toAccount = accounts.find((a) => a.id === to);
  const converting =
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency;

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          {t("Move money between accounts")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            "Banking the day’s cash, topping up the tin, converting dollars. Neither income nor a cost — just money changing shelves."
          )}
        </p>
      </div>

      <form action={action} className="space-y-3 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fromAccountId" className="text-xs">
              {t("Out of")}
            </Label>
            <NativeSelect
              id="fromAccountId"
              name="fromAccountId"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="toAccountId" className="text-xs">
              {t("Into")}
            </Label>
            <NativeSelect
              id="toAccountId"
              name="toAccountId"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="amountOut" className="text-xs">
              {t("Amount leaving")}{" "}
              {fromAccount ? (
                <span className="text-muted-foreground">
                  ({fromAccount.currency === "TZS" ? "TSh" : fromAccount.currency})
                </span>
              ) : null}
            </Label>
            <MoneyInput id="amountOut" name="amountOut" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee" className="text-xs">
              {t("Bank charge")}{" "}
              <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <MoneyInput id="fee" name="fee" placeholder="0" />
          </div>
        </div>

        {converting ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transferRate" className="text-xs">
                {t("Rate used")}
              </Label>
              <MoneyInput
                id="transferRate"
                name="exchangeRate"
                placeholder={t("e.g. 2700")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amountIn" className="text-xs">
                {t("Amount that arrived")}{" "}
                {toAccount ? (
                  <span className="text-muted-foreground">
                    ({toAccount.currency})
                  </span>
                ) : null}
              </Label>
              <MoneyInput
                id="amountIn"
                name="amountIn"
                placeholder={t("from the statement")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="amountIn" className="text-xs">
              {t("Amount that arrived")}{" "}
              <span className="text-muted-foreground">
                {t("(blank = the amount above, less the charge)")}
              </span>
            </Label>
            <MoneyInput id="amountIn" name="amountIn" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="transferReason" className="text-xs">
              {t("What for")}{" "}
              <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input
              id="transferReason"
              name="reason"
              placeholder={t("Banked Friday's takings")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transferDate" className="text-xs">
              {t("Date")}{" "}
              <span className="text-muted-foreground">
                {t("(blank for today)")}
              </span>
            </Label>
            <Input
              id="transferDate"
              name="occurredAt"
              type="date"
              max={TODAY}
            />
          </div>
        </div>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${t("Recorded")} ${state.data.transferNumber}`
              : null
          }
        />
        <SubmitButton size="sm" pendingLabel="Moving…">
          {t("Record the move")}
        </SubmitButton>
      </form>
    </section>
  );
}

/**
 * Counting the tin.
 *
 * The only fact about an account that its movements cannot tell you. A variance
 * is recorded and left standing — nothing here writes a correcting entry,
 * because a cash shortfall that balances itself is a cash shortfall nobody
 * ever looks into.
 */
export function CashCountPanel({
  accounts,
  expected,
}: {
  accounts: TreasuryAccount[];
  expected: Record<string, number>;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ variance: number }>,
    FormData
  >(recordCashCount, { ok: true });

  const cash = accounts.filter((a) => a.kind === "CASH");
  const [accountId, setAccountId] = useState(cash[0]?.id ?? "");
  const [counted, setCounted] = useState("");

  if (cash.length === 0) return null;

  const account = cash.find((a) => a.id === accountId);
  const shouldBe = expected[accountId] ?? 0;
  const typed = Number(counted);
  const diff =
    counted.trim().length > 0 && Number.isFinite(typed)
      ? Math.round((typed - shouldBe) * 100) / 100
      : null;

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          {t("Count the cash")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            "What is physically in the tin, against what the ledger says should be."
          )}
        </p>
      </div>

      <form action={action} className="space-y-3 p-5">
        {cash.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="countAccount" className="text-xs">
              {t("Which tin")}
            </Label>
            <NativeSelect
              id="countAccount"
              name="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {cash.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <input type="hidden" name="accountId" value={accountId} />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="countedAmount" className="text-xs">
            {t("Counted")}{" "}
            {account ? (
              <span className="text-muted-foreground">
                ({account.currency === "TZS" ? "TSh" : account.currency})
              </span>
            ) : null}
          </Label>
          <MoneyInput
            id="countedAmount"
            name="countedAmount"
            value={counted}
            onValueChange={setCounted}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("The ledger says")}{" "}
            {account?.currency === "TZS" ? "TSh" : account?.currency}{" "}
            {shouldBe.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {diff === null ? (
              "."
            ) : diff === 0 ? (
              <>{" "}{t("— that matches.")}</>
            ) : (
              <>
                {" "}
                {t("— that is")}{" "}
                <span className={diff < 0 ? "text-destructive" : "text-warning"}>
                  {diff < 0 ? t("short by") : t("over by")}{" "}
                  {Math.abs(diff).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
                .
              </>
            )}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="countNote" className="text-xs">
            {t("Note")}{" "}
            <span className="text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input
            id="countNote"
            name="note"
            placeholder={t("Anything that explains a difference")}
          />
        </div>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? state.data.variance === 0
                ? "Counted — it matches the ledger."
                : `${t("Counted —")} ${state.data.variance > 0 ? t("over by") : t("short by")} ${Math.abs(state.data.variance).toLocaleString()}. ${t("Recorded as it stands; nothing was adjusted.")}`
              : null
          }
        />
        <SubmitButton size="sm" variant="outline" pendingLabel="Recording…">
          {t("Record the count")}
        </SubmitButton>
      </form>
    </section>
  );
}

/**
 * The two treasury jobs, as a toolbar rather than two permanent forms.
 *
 * They were bolted to the bottom of the accounts page — two full form panels
 * always open, below the balances, whether or not anybody was moving money
 * that day. They read as furniture rather than as tools, which is exactly what
 * the owner said about them.
 *
 * A page about what the accounts hold should show what the accounts hold. The
 * forms appear when asked for, one at a time, because nobody banks cash and
 * counts the tin in the same motion.
 */
export function TreasuryActions({
  accounts,
  expected,
}: {
  accounts: TreasuryAccount[];
  expected: Record<string, number>;
}) {
  const t = useT();
  const [open, setOpen] = useState<"transfer" | "count" | null>(null);
  const hasCash = accounts.some((a) => a.kind === "CASH");

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={open === "transfer" ? "brand" : "outline"}
          size="sm"
          className="rounded-lg"
          onClick={() => setOpen(open === "transfer" ? null : "transfer")}
        >
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          {t("Move money between accounts")}
        </Button>
        {hasCash ? (
          <Button
            variant={open === "count" ? "brand" : "outline"}
            size="sm"
            className="rounded-lg"
            onClick={() => setOpen(open === "count" ? null : "count")}
          >
            <Calculator className="mr-2 h-4 w-4" />
            {t("Count the cash tin")}
          </Button>
        ) : null}
        {open ? (
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="focus-ring ml-auto inline-flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {t("Close")}
          </button>
        ) : null}
      </div>

      {open === "transfer" ? (
        <div className="mt-4">
          <TransferPanel accounts={accounts} />
        </div>
      ) : null}
      {open === "count" ? (
        <div className="mt-4 max-w-xl">
          <CashCountPanel accounts={accounts} expected={expected} />
        </div>
      ) : null}
    </div>
  );
}
