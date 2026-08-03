import type { ExceptionStatus, Role } from "@prisma/client";
import { format } from "date-fns";
import { Banknote, Lock } from "lucide-react";

import {
  ApproveCompensationForm,
  RecordCompensationForm,
} from "@/components/app/compensation-form";
import { Badge } from "@/components/ui/badge";
import {
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TERMINAL_STATUSES,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getCompensation } from "@/lib/investigations";
import { can } from "@/lib/rbac";

/**
 * The money side of an investigation, on the case page.
 *
 * Drop it in with the reader's role and it works out what that reader is
 * allowed to see and do. Three different pages will render this — the case
 * detail, the Finance payout queue, the CEO's view — and having one component
 * decide is what stops the fourth one getting it wrong.
 *
 * The amount is never a prop. It is fetched through `getCompensation`, which
 * refuses the figure to anybody without `finance.view`, so a warehouse render
 * of this panel does not have the number to leak even in the RSC payload.
 */
export async function CompensationPanel({
  exceptionId,
  exceptionStatus,
  role,
}: {
  exceptionId: string;
  exceptionStatus: ExceptionStatus;
  role: Role;
}) {
  const compensation = await getCompensation(exceptionId, role);

  const canApprove = can(role, "exception.approve");
  const canRecord = can(role, "exception.compensate");
  const seesMoney = compensation.money !== null;
  const finished = (EXCEPTION_TERMINAL_STATUSES as readonly ExceptionStatus[]).includes(
    exceptionStatus
  );
  const approved = exceptionStatus === "COMPENSATION_APPROVED";

  // Nothing to show and nothing to do: no settlement, and this desk neither
  // approves nor pays. Rendering an empty money box on a warehouse phone is
  // noise on a screen that is used one-handed.
  if (!compensation.exists && !canApprove && !canRecord) return null;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-muted-foreground" />
          Compensation
        </h2>
        {compensation.exists ? (
          <Badge variant={compensation.pending ? "warning" : "success"}>
            {compensation.pending ? "Payment pending" : "Paid"}
          </Badge>
        ) : (
          <Badge variant="muted">{EXCEPTION_STATUS_LABELS[exceptionStatus]}</Badge>
        )}
      </header>

      {compensation.exists ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {seesMoney ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Amount
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {compensation.money?.formatted}
              </dd>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <dd className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  A settlement is recorded on this case. The figure is Finance&rsquo;s
                  and is not shown on the warehouse floor.
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Paid
            </dt>
            <dd>
              {compensation.paidAt
                ? `${formatDate(compensation.paidAt)}${
                    compensation.method
                      ? ` · ${PAYMENT_METHOD_LABELS[compensation.method]}`
                      : ""
                  }`
                : "Not yet — approved and waiting on Finance."}
            </dd>
          </div>
          {compensation.recordedByName ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Recorded by
              </dt>
              <dd>
                {compensation.recordedByName}
                {compensation.recordedAt
                  ? ` · ${formatDate(compensation.recordedAt)}`
                  : ""}
              </dd>
            </div>
          ) : null}
          {compensation.note ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes
              </dt>
              <dd className="whitespace-pre-wrap">{compensation.note}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          No settlement recorded on this case.
        </p>
      )}

      {/* The CEO's decision. Not offered once the case is finished, and not
          offered twice. */}
      {canApprove && !approved && !finished && !compensation.exists ? (
        <div className="border-t pt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Approving records the decision only. Finance records what actually
            goes out.
          </p>
          <ApproveCompensationForm exceptionId={exceptionId} />
        </div>
      ) : null}

      {/* Finance's hand on the till. Only after the CEO has approved, or to
          correct a settlement that already exists. */}
      {canRecord && (approved || compensation.exists) ? (
        <div className="border-t pt-4">
          <RecordCompensationForm
            exceptionId={exceptionId}
            defaults={
              compensation.money
                ? {
                    amount: compensation.money.amount,
                    currency: compensation.money.currency,
                    paidAt: compensation.paidAt
                      ? format(compensation.paidAt, "yyyy-MM-dd")
                      : null,
                    method: compensation.method,
                    note: compensation.note,
                  }
                : null
            }
          />
        </div>
      ) : null}

      {canRecord && !approved && !compensation.exists ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Nothing to pay yet. A payout is recorded once the CEO approves
          compensation on this case.
        </p>
      ) : null}
    </section>
  );
}
