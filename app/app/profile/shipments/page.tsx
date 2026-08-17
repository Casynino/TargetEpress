import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { myShipments, profileStats } from "@/lib/profile";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import type { ShipmentStatus } from "@prisma/client";

export const metadata: Metadata = { title: "My cargo" };

/**
 * Only what this person registered.
 *
 * The batch screens answer "what is on the batch"; this answers "what have I
 * done", which is the question someone asks about their own shift. Same rows,
 * different question, so it is a separate page rather than a filter people
 * have to remember to set.
 */
export default async function MyShipmentsPage() {
  const me = await requireUser();
  const locale = await viewerLocale();
  const [rows, stats] = await Promise.all([
    // The locale was computed here for the page furniture but never handed to
    // the query, so the rows themselves — cargo, status, the unit on the count —
    // came back in English on a Chinese screen.
    myShipments(me.id, 200, locale),
    profileStats(me.id),
  ]);

  return (
    <>
      <PageHeader
        title="My cargo"
        description={`${stats.totalShipments} registered by you · ${stats.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg · ${stats.totalPackages} packages`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/profile">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t(locale, "Profile")}
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {t(locale, "You have not registered any cargo yet.")}
        </p>
      ) : (
        <>
        {/* Seven columns is a spreadsheet on a handset. Below md this is the
            clerk's own record of what they booked in: what it was, whose it is,
            and where it has got to. */}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft md:hidden">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/app/cargo/${row.trackingNumber}`}
                  className="font-mono text-sm font-semibold tabular hover:text-brand"
                >
                  {row.trackingNumber}
                </Link>
                <ShipmentStatusBadge status={row.status as ShipmentStatus} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {row.item}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.customerName} · {row.weightKg.toFixed(1)} kg ·{" "}
                {row.packagesLabel} · {row.registeredLabel}
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-hidden rounded-xl border bg-card shadow-soft md:block">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {t(locale, "Registered")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t(locale, "Tracking")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t(locale, "Customer")}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {t(locale, "Which item?")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t(locale, "Weight")}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t(locale, "Counted as")}
                  </th>
                  <th className="px-3 py-2 font-medium">{t(locale, "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/40">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground tabular">
                      {row.registeredLabel}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/app/cargo/${row.trackingNumber}`}
                        className="font-mono text-xs font-semibold tabular hover:text-brand"
                      >
                        {row.trackingNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{row.customerName}</td>
                    <td className="max-w-[22rem] truncate px-3 py-2.5 text-muted-foreground">
                      {row.item}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {row.weightKg.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                      {row.packagesLabel}
                    </td>
                    <td className="px-3 py-2.5">
                      <ShipmentStatusBadge
                        status={row.status as ShipmentStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </>
  );
}
