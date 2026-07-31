import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Activity" };

/**
 * What the floor has been doing, everyone together.
 *
 * The audit log under Management answers "who did this and can I prove it".
 * This answers a different question — "what has happened while I was on the
 * forklift" — so it shows only the operational actions, in plain words, with
 * the tracking number as the way in.
 *
 * Open to anyone with an account. Nothing here is sensitive: it is the same
 * cargo movements everybody can already see on the batch screens, only in the
 * order they happened.
 */
const OPERATIONAL = [
  "shipment.create",
  "shipment.update",
  "label.print",
  "batch.dispatch",
  "batch.seal",
  "batch.receive",
  "batch.verifyShipment",
  "batch.flagShipment",
  "cargo.delete",
  "cargo.restore",
  "shipment.release",
];

export default async function ActivityPage() {
  await requireUser();

  const rows = await prisma.auditLog.findMany({
    where: { action: { in: OPERATIONAL } },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: {
      id: true,
      action: true,
      summary: true,
      entity: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { name: true, photoUrl: true } },
    },
  });

  // Grouped by day, because "was that this morning or on Tuesday" is the first
  // thing anyone wants to know about an entry.
  const days = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = formatDate(row.createdAt);
    days.set(key, [...(days.get(key) ?? []), row]);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything that has happened on the floor, newest first."
      />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nothing recorded yet.
        </p>
      ) : (
        <div className="space-y-6">
          {[...days.entries()].map(([day, entries]) => (
            <section key={day} className="panel">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h2 className="text-sm font-semibold">{day}</h2>
                <span className="text-xs text-muted-foreground tabular">
                  {entries.length}
                </span>
              </div>
              <ol className="divide-y">
                {entries.map((entry) => {
                  const meta = entry.metadata as
                    | { trackingNumber?: string }
                    | null;
                  const tracking =
                    meta?.trackingNumber ??
                    (entry.entity === "Shipment" ? null : null);

                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3"
                    >
                      <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">
                        {entry.createdAt.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">
                          {entry.actor?.name ?? "System"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {entry.summary}
                        </span>
                      </span>
                      {tracking ? (
                        <Link
                          href={`/app/cargo/${tracking}`}
                          className="shrink-0 font-mono text-xs text-brand tabular hover:underline"
                        >
                          {tracking}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
