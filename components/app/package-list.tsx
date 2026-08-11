import { Boxes, Check, PackageCheck, Printer } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PACKAGE_TYPE_LABELS, formatPackages } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export type PackageRow = {
  id: string;
  sequence: number;
  reference: string;
  receivedAt: Date | null;
  deliveredAt: Date | null;
  receivedByName: string | null;
};

/**
 * The boxes, one line each.
 *
 * A shipment of five cartons is five rows here, and the point of the list is
 * the gap: four ticks and one blank is a shortage, and it should be readable in
 * a second rather than counted. The same list serves China (labels printed) and
 * Dar (boxes checked in), because it is the same five boxes.
 */
export async function PackageList({
  trackingNumber,
  packageType,
  packages,
  canPrint = false,
}: {
  trackingNumber: string;
  packageType: string;
  packages: PackageRow[];
  canPrint?: boolean;
}) {
  const locale = await viewerLocale();
  const unit = PACKAGE_TYPE_LABELS[packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  const received = packages.filter((p) => p.receivedAt).length;
  const missing = packages.filter((p) => !p.receivedAt).map((p) => p.sequence);

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <Boxes className="h-4 w-4" />
          {t(locale, "Packages")}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular">
            {received} of {formatPackages(packages.length, packageType)} checked
            in
          </span>
          {canPrint ? (
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={`/app/cargo/${trackingNumber}/label`}>
                <Printer className="mr-2 h-3.5 w-3.5" />
                {t(locale, "Print labels")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {missing.length > 0 && received > 0 ? (
        <p className="border-b border-warning/30 bg-warning/5 px-5 py-3 text-sm text-warning">
          Short {missing.length} {missing.length === 1 ? unit.one : unit.many} —
          number {missing.join(", ")} not checked in. This shipment cannot be
          released until every package is here.
        </p>
      ) : null}

      <ul className="divide-y">
        {packages.map((pkg) => (
          <li
            key={pkg.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="tabular">
                  {unit.one.charAt(0).toUpperCase() + unit.one.slice(1)}{" "}
                  {pkg.sequence} of {packages.length}
                </span>
                {pkg.deliveredAt ? (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <PackageCheck className="h-3 w-3" />
                    {t(locale, "Collected")}
                  </Badge>
                ) : pkg.receivedAt ? (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Check className="h-3 w-3" />
                    {t(locale, "In Dar")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {t(locale, "Not checked in")}
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {pkg.reference}
              </p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {pkg.receivedByName
                ? `Checked in by ${pkg.receivedByName}`
                : t(locale, "Awaiting arrival")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
