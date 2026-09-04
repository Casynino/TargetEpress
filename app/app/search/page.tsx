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
import { SearchBox } from "@/components/app/search-box";
import { EXCEPTION_TYPE_LABELS } from "@/lib/constants";
import { suggestCargo } from "@/lib/actions/suggest";
import { toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { resolveScannedCode } from "@/lib/packages";
import { prisma } from "@/lib/prisma";
import { claimsForInvoices, type Claim } from "@/lib/claimed";
import { parseQrPayload } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { searchShipments } from "@/lib/support";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Search cargo") };
}

/** As many rows as are worth scrolling. Anything past this is a narrower search. */
const LIMIT = 60;

/** The four handles a warehouse clerk actually has when hunting for a box. */
const HANDLES = [
  {
    icon: QrCode,
    title: "A QR code",
    hint: "Scan or paste the label off the carton — package or consignment, old labels included.",
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
  const locale = await viewerLocale();
  const showMoney = can(user.role, "finance.view");

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  // A scanned label resolves to a shipment — and, when the sticker came off a
  // box, to the specific package. Unrecognised label-shaped input is called out
  // rather than silently returning nothing.
  const scanned = query ? await resolveScannedCode(query) : null;
  const looksLikeLabel = query ? parseQrPayload(query) !== null : false;

  /*
    Sixty rows, and one more so the count above them can be honest.

    The page printed `rows.length` as the number of results, so a search for a
    common Dar name that matched a hundred and forty consignments announced "60
    results for Mohamed" as a fact — and the clerk, having scrolled the whole
    list, told the customer their cargo was not in the system. `searchShipments`
    has no total to hand back and duplicating its `where` here would be the
    second, divergent search this page exists to avoid, so it is asked for one
    row beyond the cap instead: if that row comes back there are more matches
    than are shown, and the line below says so rather than naming a number it
    cannot know.
  */
  const hits = query ? await searchShipments(query, LIMIT + 1) : [];
  const more = hits.length > LIMIT;
  const matches = more ? hits.slice(0, LIMIT) : hits;

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

  /*
    Which of these bills already has money waiting on Finance.

    One query for the whole page rather than one per row — this list is
    fifty long — and only asked for when the reader may see money at all.
  */
  const claims: Map<string, Claim> = showMoney
    ? await claimsForInvoices(
        found.map((s) => s.invoice?.id).filter((v): v is string => Boolean(v))
      )
    : new Map();

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
      description: cargoText(locale, shipment, "description"),
      packages: shipment.packages,
      weightKg: toNumber(shipment.weightKg),
      origin: shipment.origin,
      batchNumber: shipment.batch?.batchNumber ?? null,
      arrivedAt: shipment.arrivedAt?.toISOString() ?? null,
      fromLabel: scanned?.shipmentId === shipment.id,
      // De-duplicated: two damage reports against one consignment are one
      // problem to whoever is reading the row, not two badges.
      problems: [
        ...new Set(
          shipment.exceptions.map((exception) =>
            t(locale, EXCEPTION_TYPE_LABELS[exception.type])
          )
        ),
      ],
      ...(showMoney && shipment.invoice && claims.get(shipment.invoice.id)
        ? (() => {
            const claim = claims.get(shipment.invoice!.id)!;
            return {
              claimed: {
                label:
                  claim.covers.length > 1
                    ? `${t(locale, "Payment submitted")} · ${claim.covers.length}`
                    : t(locale, "Payment submitted"),
                detail: [
                  `${claim.currency} ${claim.amount}`,
                  claim.submissionNumber,
                  claim.reference,
                  claim.submittedByName,
                  claim.covers.map((c) => c.trackingNumber).filter(Boolean).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · "),
              },
            };
          })()
        : {}),
      ...(showMoney
        ? {
            owed: {
              label:
                outstanding === null
                  ? t(locale, "Not billed")
                  : outstanding > 0
                    ? formatUsd(outstanding)
                    : t(locale, "Settled"),
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
        title={t(locale, "Search cargo")}
        description={t(
          locale,
          "Find a box by its QR label, tracking number, customer name or phone number."
        )}
        /*
          Offered only to the desks that can actually use a camera.

          This page is reachable by every role, but the scanner behind this
          button is not: it lives on the release screen, which needs
          shipment.release. Ungated, three of the five roles pressed it and
          were bounced to /app/no-access.
        */
        actions={
          can(user.role, "shipment.release") ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/app/release">
                <ScanLine className="mr-2 h-4 w-4" />
                {t(locale, "Use the camera")}
              </Link>
            </Button>
          ) : null
        }
      />

      {/*
        Suggestions asked for, not filtered.

        Every other search in the app narrows a list that is already on screen;
        this one looks through every consignment the company has ever carried, so
        there is nothing to filter and the dropdown has to ask. It asks with the
        SAME query the results use, so it can never offer a row the page then
        refuses to show.
      */}
      <div className="panel mb-6 p-4">
        <SearchBox
          defaultValue={query}
          placeholder={t(locale, "QR code, tracking number, customer name or phone number")}
          suggestions={[]}
          fetchSuggestions={suggestCargo}
        />
      </div>

      {!query ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HANDLES.map((handle) => (
            <div key={handle.title} className="panel p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <handle.icon className="h-4 w-4 text-brand" />
                {t(locale, handle.title)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(locale, handle.hint)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {query && looksLikeLabel && !scanned ? (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <QrCode className="h-4 w-4" />
            {t(locale, "That code is not a Target Express label")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              locale,
              "Nothing in the system carries it. Check you scanned our sticker and not a supplier's, then try the tracking number instead."
            )}
          </p>
        </div>
      ) : null}

      {scanned ? (
        <div className="mb-4 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4 text-brand" />
            {t(locale, "Label read")}
            {scanned.package
              ? ` — ${scanned.package.reference}, ${t(locale, "package")} ${scanned.package.sequence}`
              : ` ${t(locale, "— consignment label")}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scanned.package
              ? scanned.package.deliveredAt
                ? t(locale, "This box has already been handed over.")
                : scanned.package.receivedAt
                  ? t(locale, "This box has been checked in at Dar.")
                  : t(locale, "This box has not been checked in yet.")
              : t(locale, "The code identifies the consignment rather than one box.")}{" "}
            {t(locale, "Its cargo is first in the results below.")}
          </p>
        </div>
      ) : null}

      {query ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {more ? (
            <>
              {t(locale, "Showing")} {rows.length} {t(locale, "matches for")}{" "}
              <span className="font-medium text-foreground">{query}</span>
              {" — "}
              <span className="font-medium text-warning">
                {t(locale, "there are more than this. Narrow the search.")}
              </span>
            </>
          ) : (
            <>
              {rows.length}{" "}
              {t(locale, rows.length === 1 ? "result for" : "results for")}{" "}
              <span className="font-medium text-foreground">{query}</span>
            </>
          )}
        </p>
      ) : null}

      {query && rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t(locale, "Nothing matched")}
          description={t(
            locale,
            "Try a shorter piece of it — part of a name, the last few digits of the phone number, or the carton reference written on the box."
          )}
        />
      ) : null}

      {rows.length > 0 ? <CargoSearchResults rows={rows} /> : null}
    </>
  );
}
