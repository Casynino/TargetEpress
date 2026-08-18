import { PayrollLineForm } from "@/components/app/payroll-forms";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { toNumber } from "@/lib/format";
import { formatShillings } from "@/lib/money";

type Item = {
  id: string;
  name: string;
  roleLabel: string;
  employeeId: string | null;
  gross: unknown;
  allowance: unknown;
  deduction: unknown;
  net: unknown;
  note: string | null;
};

/**
 * The month, name by name.
 *
 * Rendered in full on BOTH screens rather than summarised on the manager's.
 * A total is not something anybody can agree to — the question a manager is
 * actually being asked is "is this the right list of people at the right
 * amounts", and that question needs the list. Summarising it would make the
 * approval step a rubber stamp with extra clicks.
 */
export function PayrollTable({
  items,
  locale,
  rate,
  editable,
}: {
  items: Item[];
  locale: Locale;
  rate: number | null;
  /** Finance may edit allowances and deductions while the run is theirs. */
  editable: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t(locale, "Who")}</th>
            <th className="px-3 py-2 text-right font-medium">{t(locale, "Salary")}</th>
            <th className="px-3 py-2 font-medium">
              {editable ? t(locale, "Allowance / deduction") : t(locale, "Adjustments")}
            </th>
            <th className="px-3 py-2 text-right font-medium">{t(locale, "Takes home")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((i) => {
            const gross = toNumber(i.gross as never);
            const net = toNumber(i.net as never);
            return (
              <tr key={i.id} className="align-top">
                <td className="px-3 py-2">
                  <span className="block font-medium">{i.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {i.roleLabel}
                    {i.employeeId ? ` · ${i.employeeId}` : ""}
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-right text-muted-foreground">
                  {formatShillings(gross, rate)}
                </td>
                <td className="px-3 py-2">
                  <PayrollLineForm
                    itemId={i.id}
                    allowance={toNumber(i.allowance as never)}
                    deduction={toNumber(i.deduction as never)}
                    note={i.note}
                    editable={editable}
                  />
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold">
                  {formatShillings(net, rate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
