import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch, QrCode, ScanLine, SearchX } from "lucide-react";

import {
  CargoSearchResults,
  type CargoSearchRow,
} from "@/components/app/cargo-search-results";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { resolveScannedCode } from "@/lib/packages";
import { prisma } from "@/lib/prisma";
import { parseQrPayload } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { searchShipments } from "@/lib/support";

export const metadata: Metadata = { title: "Search cargo" };

/** The four handles a warehouse clerk actually has when hunting for a box. */
const HANDLES = [
  {
    icon: QrCode,
    title: "A QR code",
    hint: "Scan or paste the label off the carton — package or shipment, old labels included.",
  },
  {
    icon: PackageSearch,
    title: "A tracking number",
    hint: "TX-000125, or the carton reference from the Guangzhou packing list.",
  },
  {
    icon: PackageSearch,
    title: "A customer name",
    hint: "Part of it is enough. Their customer code works too.",
  },
  {
    icon: PackageSearch,
    title: "A phone number",
    hint: "Typed the way they read it off the handset — 0757…, +255757… or the last digits.",
  },
];

/**
 * Find one box.
 *
 * Deliberately the same query as the support desk's search (`searchShipments`)
 * rather than a second, divergent one: tracking number, carton reference,
 * description, customer name, customer code, every shape of a Tanzanian phone
 * number, batch and invoice all go in the one field. Two searches that disagree
 * about what "found" means is how a clerk concludes cargo is lost.
 *
 * What this page adds on top is the label itself. A scanned QR is not text the
 * support desk ever types, so it is resolved through `resolveScannedCode` — the
 * same resolver the release counter trusts — and its shipment is pinned to the
 * top of the results.
 *
 * Prices are gated on `finance.view`, so the Dar warehouse sees where a box is
 * and never what it costs.
 */
export default async function SearchCargoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const showMoney = can(user.role, "finance.view");

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  // A scanned label resolves to a shipment — and, when the sticker came off a
  // box, to the specific package. Unrecognised label-shaped input is called out
  // rather than silently returning nothing.
  const scanned = query ? await resolveScannedCode(query) : null;
  const looksLikeLabel = query ? parseQrPayload(query) !== null : false;

  const matches = query ? await searchShipments(query, 60) : [];

  let found = matches;
  if (scanned && !matches.some((match) => match.id === scanned.shipmentId)) {
    // Reached only by scanning: the token is not text, so the text search above
    // cannot have matched it. Ask the same query for the tracking number so the
    // row comes back in exactly the shape the table expects.
    const target = await prisma.shipment.findUnique({
      where: { id: scanned.shipmentId },
      select: { trackingNumber: true },
    });
    if (target) {
      const exact = (await searchShipments(target.trackingNumber, 5)).filter(
        (shipment) => shipment.id === scanned.shipmentId
      );
      found = [...exact, ...matches];
    }
  } else if (scanned) {
    found = [
      ...matches.filter((match) => match.id === scanned.shipmentId),
      ...matches.filter((match) => match.id !== scanned.shipmentId),
    ];
  }

  const rows: CargoSearchRow[] = found.map((shipment) => {
    const invoice = shipment.invoice;
    const outstanding = invoice
      ? Math.max(0, toNumber(invoice.total) - toNumber(invoice.amountPaid))
      : null;

    return {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      customerId: shipment.customer.id,
      customerName: shipment.customer.name,
      customerPhone: shipment.customer.phone,
      description: shipment.description,
      packages: shipment.packages,
      weightKg: toNumber(shipment.weightKg),
      origin: shipment.origin,
      batchNumber: shipment.batch?.batchNumber ?? null,
      arrivedAt: shipment.arrivedAt?.toISOString() ?? null,
      fromLabel: scanned?.shipmentId === shipment.id,
      ...(showMoney
        ? {
            owed: {
              label:
                outstanding === null
                  ? "Not billed"
                  : outstanding > 0
                    ? formatUsd(outstanding)
                    : "Settled",
              state:
                outstanding === null
                  ? ("unbilled" as const)
                  : outstanding > 0
                    ? ("due" as const)
                    : ("settled" as const),
            },
          }
        : {}),
    };
  });

  return (
    <>
      <PageHeader
        title="Search cargo"
        description="Find a box by its QR label, tracking number, customer name or phone number."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/scan">
              <ScanLine className="mr-2 h-4 w-4" />
              Use the camera
            </Link>
          </Button>
        }
      />

      <form action="/app/search" className="panel mb-6 flex flex-col gap-2 p-4 sm:flex-row">
        <Input
          name="q"
          defaultValue={query}
          placeholder="QR code, tracking number, customer name or phone number"
          className="flex-1"
          autoComplete="off"
          aria-label="Search cargo"
        />
        <Button type="submit" variant="brand">
          Search
        </Button>
      </form>

      {!query ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {HANDLES.map((handle) => (
            <div key={handle.title} className="panel p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <handle.icon className="h-4 w-4 text-brand" />
                {handle.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{handle.hint}</p>
            </div>
          ))}
        </div>
      ) : null}

      {query && looksLikeLabel && !scanned ? (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <QrCode className="h-4 w-4" />
            That code is not a Target Express label
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing in the system carries it. Check you scanned our sticker and
            not a supplier&apos;s, then try the tracking number instead.
          </p>
        </div>
      ) : null}

      {scanned ? (
        <div className="mb-4 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4 text-brand" />
            Label read
            {scanned.package
              ? ` — ${scanned.package.reference}, package ${scanned.package.sequence}`
              : " — shipment label"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scanned.package
              ? scanned.package.deliveredAt
                ? "This box has already been handed over."
                : scanned.package.receivedAt
                  ? "This box has been checked in at Dar."
                  : "This box has not been checked in yet."
              : "The code identifies the consignment rather than one box."}{" "}
            Its cargo is first in the results below.
          </p>
        </div>
      ) : null}

      {query ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {rows.length} result{rows.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-foreground">{query}</span>
        </p>
      ) : null}

      {query && rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matched"
          description="Try a shorter piece of it — part of a name, the last few digits of the phone number, or the carton reference written on the box."
        />
      ) : null}

      {rows.length > 0 ? <CargoSearchResults rows={rows} /> : null}
    </>
  );
}
