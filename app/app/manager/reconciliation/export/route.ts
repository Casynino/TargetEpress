import { NextResponse, type NextRequest } from "next/server";

import { toNumber } from "@/lib/format";
import { KIND_LABEL, reconciliationQueue, QUEUE_PAGE_SIZE } from "@/lib/reconciliation-workspace";
import { requirePermission } from "@/lib/session";

/**
 * The reconciliation queue as it stands on screen, as a file.
 *
 * SAME FILTERS, SAME ROWS. The export reads the identical query the page does,
 * so a manager who narrows to one account and one week gets that and not a
 * whole year — an export that quietly ignores the filters is how a figure ends
 * up in a meeting with no relationship to the screen it was taken from.
 *
 * Paging is the one thing it drops: the screen shows forty at a time because a
 * person reads forty at a time, and a file has no such limit.
 */
export async function GET(request: NextRequest) {
  await requirePermission("report.view");

  const params = Object.fromEntries(request.nextUrl.searchParams) as Record<string, string>;
  const rows: string[][] = [
    [
      "Entry",
      "Date",
      "Type",
      "Account",
      "Direction",
      "Amount",
      "Currency",
      "Amount USD",
      "Description",
      "Reference",
      "Recorded by",
      "Standing",
      "Verdict by",
      "Reason",
    ],
  ];

  /* Walk the pages rather than lifting the cap: one query shape, one place
     where the filters are interpreted. */
  let page = 1;
  for (;;) {
    const queue = await reconciliationQueue({ ...params, page: String(page) });
    for (const entry of queue.entries) {
      rows.push([
        entry.entryNumber,
        entry.occurredAt.toISOString().slice(0, 10),
        KIND_LABEL[entry.kind] ?? entry.kind,
        entry.account.name,
        entry.direction,
        toNumber(entry.amount).toFixed(2),
        entry.currency,
        toNumber(entry.amountUsd).toFixed(2),
        entry.description,
        entry.payment?.reference ?? entry.expense?.expenseNumber ?? "",
        entry.recordedBy?.name ?? "",
        entry.state,
        entry.standing?.reviewedBy ?? "",
        entry.standing?.reason ?? "",
      ]);
    }
    if (queue.entries.length < QUEUE_PAGE_SIZE || page >= queue.pages) break;
    page += 1;
  }

  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          /* Quote anything that would otherwise break a column, and double any
             quote inside it — a vendor called 5" Pipes should not shift every
             figure on its row one column to the left. */
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reconciliation-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
