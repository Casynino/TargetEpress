import type { Metadata } from "next";
import Link from "next/link";

import { FinanceNav } from "@/components/app/finance-nav";
import { IncomeSheetTable } from "@/components/app/income-sheet";
import { PageHeader } from "@/components/app/page-header";
import { financeTabs } from "@/lib/finance-tabs";
import { incomeSheet } from "@/lib/income";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Income" };

/**
 * What came in, and what has been collected against it.
 *
 * This is the sheet Finance has always kept by hand, and the owner asked for
 * it in the system so the boss can read the same thing without anybody typing
 * it twice. Everything on it except two per-kilo rates is computed from the
 * invoices and payments already on record, so it cannot drift from the books.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePermission("accounting.view");
  const { month } = await searchParams;

  const sheet = await incomeSheet(month);

  return (
    <>
      <PageHeader
        title="Income"
        description="Every flight: what landed, what it cost to land it, and how much of it has been paid for."
      />
      <FinanceNav tabs={financeTabs(user.role)} />

      {sheet.months.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[{ key: "", label: "Every month" }, ...sheet.months].map((option) => {
            const active = (month ?? "") === option.key;
            return (
              <Link
                key={option.key || "all"}
                href={option.key ? `?month=${option.key}` : "?"}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground/25 bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent"
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      <IncomeSheetTable
        sheet={sheet}
        month={month}
        canEdit={can(user.role, "expense.record")}
      />
    </>
  );
}
