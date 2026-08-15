import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Boxes } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { myBatches } from "@/lib/profile";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "My batches" };

/**
 * Batches this person contributed to, and how much of each is theirs.
 *
 * The batch pages themselves show the whole flight. This shows the slice one
 * person is responsible for, which is the only part they can answer for when a
 * carton goes missing.
 */
export default async function MyBatchesPage() {
  const me = await requireUser();
  const locale = await viewerLocale();
  const batches = await myBatches(me.id, locale);

  const totals = batches.reduce(
    (acc, b) => ({
      shipments: acc.shipments + b.shipments,
      weight: acc.weight + b.weightKg,
    }),
    { shipments: 0, weight: 0 }
  );

  return (
    <>
      <PageHeader
        title="My batches"
        description={
          batches.length === 0
            ? "Cargo you register joins a loading table automatically."
            : `${batches.length} batches · ${totals.shipments} consignments · ${totals.weight.toFixed(1)} kg registered by you`
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/profile">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t(locale, "Profile")}
            </Link>
          </Button>
        }
      />

      {batches.length === 0 ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t(locale, "You have not put cargo on a batch yet.")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((batch) => (
            <Link
              key={batch.id}
              href={
                batch.permanent
                  ? `/app/batches/${batch.id}`
                  : `/app/shipments/${batch.id}`
              }
              className="panel block p-5 transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-mono text-sm font-bold tabular">
                    <Boxes className="h-4 w-4 text-muted-foreground" />
                    {batch.batchNumber}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {batch.departedLabel
                      ? `Departed ${batch.departedLabel}`
                      : t(locale, "Still in China")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {t(locale, batch.statusLabel)}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
                {[
                  {
                    label: t(locale, "Registered by you"),
                    value: String(batch.shipments),
                  },
                  {
                    label: t(locale, "Your weight"),
                    value: `${batch.weightKg.toFixed(1)} kg`,
                  },
                  {
                    label: t(locale, "Your packages"),
                    value: String(batch.packages),
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 font-display text-base font-bold tabular">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
