"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";

import { AskForCredit } from "@/components/app/ask-for-credit";
import type { ExpenseAccount } from "@/components/app/expense-form";
import { RecordIncome } from "@/components/app/record-income";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/app/locale-provider";

/**
 * The three answers to the same phone call, on every screen of this workspace.
 *
 * They have paid, they are paying several consignments at once, or they want
 * time. Whichever list the desk happens to be looking at — who owes money,
 * what is with Finance, what came back — the customer on the line is asking
 * one of those three, so the buttons cannot belong to one tab.
 *
 * A client component only because the sidebar's "Record Payment" row arrives
 * with ?record=1 and expects the panel already open. The layout that renders
 * this is a server component and a layout cannot read the query, so the one
 * piece that needs it reads it itself.
 */
export function CollectionsActions({
  accounts,
  rate,
  canRecord,
  canAdjust,
  canAskForCredit,
  canDecideCredit,
}: {
  accounts: ExpenseAccount[];
  rate: number | null;
  canRecord: boolean;
  /** ledger.adjust — may clear a difference that will never arrive. */
  canAdjust?: boolean;
  canAskForCredit: boolean;
  canDecideCredit: boolean;
}) {
  const t = useT();
  const params = useSearchParams();

  return (
    <>
      {/* A customer who rings back to say they have paid often has three
          consignments and has sent one transfer for all of them. Settling
          those one at a time makes three receipts and three account movements
          for a deposit the bank shows once. */}
      <Button asChild variant="outline" size="sm">
        <Link href="/app/finance/payments/new">
          <Banknote className="mr-2 h-4 w-4" />
          {t("Merge Payment")}
        </Link>
      </Button>
      {canAskForCredit ? (
        <AskForCredit rate={rate} canApprove={canDecideCredit} />
      ) : null}
      <RecordIncome
        accounts={accounts}
        rate={rate}
        canRecord={canRecord}
        canAdjust={canAdjust}
        autoOpen={params.get("record") === "1"}
      />
    </>
  );
}
