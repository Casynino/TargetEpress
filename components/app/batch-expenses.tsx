import { Paperclip } from "lucide-react";

import {
  ExpenseForm,
  type ExpenseAccount,
  type QuickExpense,
} from "@/components/app/expense-form";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
} from "@/lib/expenses";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export type BatchExpenseRow = {
  id: string;
  expenseNumber: string;
  category: string;
  expenseClass: string;
  description: string;
  note: string | null;
  vendor: string | null;
  amount: number;
  currency: string;
  amountUsd: number;
  status: string;
  incurredAt: Date;
  accountName: string | null;
  recordedBy: string | null;
  receipts: number;
};

/**
 * What this flight cost, and the form to add the next one.
 *
 * The costs live on the flight rather than in a central expenses list because
 * that is where they are known: whoever is looking at GZ/26-28 is the person
 * who just paid its clearing agent, and asking them to leave the page, find a
 * dispatch picker and choose the right flight from a list is how a cost ends
 * up attributed to nothing.
 *
 * Only operating costs count towards the flight's profit. A special cost
 * recorded here is still listed — it was real money and hiding it would be
 * worse — but it is marked, and the profit figure above excludes it.
 */
export async function BatchExpenses({
  batchId,
  batchNumber,
  expenses,
  accounts,
  quick,
  thresholdUsd,
  rate,
  canRecord,
}: {
  batchId: string;
  batchNumber: string;
  expenses: BatchExpenseRow[];
  accounts: ExpenseAccount[];
  quick: QuickExpense[];
  thresholdUsd: number;
  rate: number | null;
  canRecord: boolean;
}) {
  const locale = await viewerLocale();

  const operating = expenses.filter(
    (e) => e.expenseClass === "OPERATING" && e.status !== "VOID"
  );
  const total = operating.reduce((sum, e) => sum + e.amountUsd, 0);

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">
            {t(locale, "Cost of this flight")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              locale,
              "Customs, port charges, clearing, transport and permits for this dispatch"
            )}
          </p>
        </div>
        <p className="font-display text-lg font-bold tabular-nums">
          {formatUsd(total)}
        </p>
      </div>

      {expenses.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {t(
            locale,
            "Nothing recorded against this flight yet, so its profit is revenue with nothing taken off it."
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2 font-medium">{t(locale, "Cost")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Category")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Date")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Account")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Recorded by")}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t(locale, "Amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const dropped = e.status === "VOID";
                const special = e.expenseClass === "NON_OPERATING";
                return (
                  <tr
                    key={e.id}
                    className={`border-b last:border-0 ${dropped ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-2.5">
                      <span className={dropped ? "line-through" : "font-medium"}>
                        {e.description}
                      </span>
                      {special ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {t(locale, "Special — not in this flight's profit")}
                        </span>
                      ) : null}
                      {e.vendor ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {e.vendor}
                        </span>
                      ) : null}
                      {e.receipts > 0 ? (
                        <Paperclip
                          className="ml-1.5 inline h-3 w-3 text-muted-foreground"
                          aria-label={t(locale, "Proof attached")}
                        />
                      ) : null}
                      {e.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {e.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {t(locale, EXPENSE_CATEGORY_LABELS[e.category] ?? e.category)}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(e.incurredAt, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {/* No account means it has not been paid yet — which is a
                          different thing from having been paid from nowhere. */}
                      {e.accountName ??
                        t(locale, EXPENSE_STATUS_LABELS[e.status] ?? e.status)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {e.recordedBy ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={dropped ? "line-through" : ""}>
                        {formatUsd(e.amountUsd)}
                      </span>
                      {e.currency !== "USD" ? (
                        <span className="block text-xs text-muted-foreground">
                          {e.currency} {e.amount.toLocaleString()}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canRecord ? (
        <div className="border-t bg-muted/30">
          <ExpenseForm
            accounts={accounts}
            quick={quick}
            thresholdUsd={thresholdUsd}
            rate={rate}
            fixedDispatch={{ id: batchId, label: batchNumber }}
          />
        </div>
      ) : null}
    </section>
  );
}
