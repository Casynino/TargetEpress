"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";

import { AskForCredit } from "@/components/app/ask-for-credit";
import { RecordCostButton } from "@/components/app/record-cost-button";
import { RecordIncome } from "@/components/app/record-income";
import { useT } from "@/components/app/locale-provider";
import type { ExpenseAccount } from "@/components/app/expense-form";

/**
 * THE FOUR THINGS A MONEY DESK DOES, ON EVERY SCREEN IT DOES THEM FROM.
 *
 * Payment, cost, merge and credit. They lived on the Ledger alone, so moving
 * to Accounts or Payroll emptied the top-right of the screen — the loudest
 * part of the "I have gone somewhere else" feeling the owner reported. They
 * are not the Ledger's actions; they are the department's.
 *
 * One word each with its icon, because four full phrases wrap this row onto a
 * second line; the full names are on hover and inside each panel.
 *
 * A client component only so the Home tile can link straight in with the
 * income panel already open — a layout cannot read the query, and this is the
 * one piece that needs it.
 */
export function FinanceActions({
  accounts,
  quickExpenses,
  rate,
  canTakeMoney,
  canRecordCost,
  canAdjust,
  canDiscount,
  canChangeRate,
  canWaiveStorage,
  canAskForCredit,
  canDecideCredit,
}: {
  accounts: ExpenseAccount[];
  quickExpenses: { label: string; category: string }[];
  rate: number | null;
  canTakeMoney: boolean;
  canRecordCost: boolean;
  /** ledger.adjust — may clear a difference that will never arrive. */
  canAdjust?: boolean;
  /** invoice.discount / invoice.rate / invoice.storage.waive — the same power
      the cargo page gives this desk, offered wherever they record money. */
  canDiscount?: boolean;
  canChangeRate?: boolean;
  canWaiveStorage?: boolean;
  canAskForCredit: boolean;
  canDecideCredit: boolean;
}) {
  const t = useT();
  const params = useSearchParams();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canTakeMoney ? (
        <RecordIncome
          compact
          accounts={accounts}
          rate={rate}
          canAdjust={canAdjust}
          canDiscount={canDiscount}
          canChangeRate={canChangeRate}
          canWaiveStorage={canWaiveStorage}
          autoOpen={params.get("income") === "1"}
        />
      ) : null}
      {canTakeMoney ? (
        <Link
          href="/app/finance/payments/new"
          title={t("Merge Payment")}
          className="focus-ring inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Layers className="h-4 w-4" />
          {t("Merge")}
        </Link>
      ) : null}
      {canAskForCredit ? (
        <AskForCredit compact rate={rate} canApprove={canDecideCredit} />
      ) : null}
      {canRecordCost ? (
        <RecordCostButton
          compact
          accounts={accounts}
          quick={quickExpenses}
          rate={rate}
        />
      ) : null}
    </div>
  );
}
