"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import {
  ExpenseForm,
  type ExpenseAccount,
  type QuickExpense,
} from "@/components/app/expense-form";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";

/**
 * Recording a cost, from the register.
 *
 * The place somebody watches money leave is the place they should be able to
 * write down money leaving. It opens over the ledger rather than on a page of
 * its own, so the register they were reading is still behind it and still there
 * when they close it.
 */
export function RecordCostButton({
  accounts,
  quick,
  rate,
  categories = [],
  dispatches = [],
  compact = false,
}: {
  accounts: ExpenseAccount[];
  quick: QuickExpense[];
  rate: number | null;
  /** The Expenses page names its own; the ledger takes the defaults. */
  categories?: { value: string; label: string }[];
  dispatches?: { id: string; label: string }[];
  /** One word instead of three — see RecordIncome's own compact mode. */
  compact?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="brand"
        className="rounded-lg"
        title={t("Record a cost")}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        {compact ? t("Cost") : t("Record a cost")}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={t("Record a cost")}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
                {t("Close")}
              </button>
            </div>
            <ExpenseForm
              categories={categories}
              accounts={accounts}
              dispatches={dispatches}
              quick={quick}
              rate={rate}
              alwaysOpen
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
