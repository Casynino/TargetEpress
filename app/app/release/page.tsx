import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ReleaseWorkbench } from "@/components/app/release-workbench";
import { resolveScan } from "@/lib/actions/scan";
import { normaliseCode, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Release cargo") };
}

/**
 * Where a scanned cargo label lands, and where the job finishes.
 *
 * There is no screen between the scan and the handover. A clerk points a phone
 * at the sticker on a carton and this page opens with the customer, the cargo,
 * the money and the release form already on it — or with the reason it cannot
 * be released. /app/scan redirects here, because the only two roles that can
 * scan are the only two that can release: an intermediate detail page had no
 * audience, it just cost the counter a second navigation with a customer
 * waiting.
 */
export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{
    /** A raw QR payload — somebody physically scanned this box. */
    code?: string;
    /** A pickup note number, from the queue's Release button. */
    note?: string;
    /** A tracking number, from any list that offers a handover. */
    open?: string;
  }>;
}) {
  const { code, note, open } = await searchParams;
  await requirePermission("shipment.release");
  const locale = await viewerLocale();

  /**
   * Three ways in, and the difference between them matters.
   *
   * `code` is a scan: somebody has read the label off a box that is on the
   * counter. That satisfies the scan the release records, so the handover runs
   * straight through.
   *
   * `note` and `open` are picks off a list — the pickup queue's Release
   * button, an inventory row. They name the cargo but prove nothing about
   * where it is, so the screen opens on the right consignment and still asks
   * for the box to be read before anything leaves the building.
   *
   * `note` in particular was already being sent by the pickup queue and was
   * never read: the button dropped the clerk on an empty release page and let
   * them find the customer again by hand.
   *
   * All three resolve here rather than in the browser. Making the client ask
   * would flash an empty scanner first, which is the very impression this page
   * exists to remove.
   */
  const chosen = await tokenFor({ note, open });
  const scannedCode = code ?? chosen;
  const scan = scannedCode ? await resolveScan(scannedCode) : null;
  const initial = scan?.ok ? (scan.data ?? null) : null;
  const failure = scan && !scan.ok ? scan.error : null;

  /**
   * The by-hand fallback list: cleared cargo, and the code that opens it.
   *
   * Only reachable behind a disclosure on the scan screen. It exists for a
   * carton whose label AND whose customer's printed pickup note are both
   * unreadable, which is rare — either code resolves to the same consignment.
   */
  /*
    Only when the fallback list can actually be opened.

    A scan renders the consignment immediately and never shows the list, so
    fetching every cleared note company-wide on that path made the clerk wait
    on rows nobody would look at — on the one screen whose whole job is to
    answer fast.
  */
  const notes = initial ? [] : await prisma.pickupNote.findMany({
    // The soft-delete filter on the client covers the model being queried, not
    // its relations, so a note left open on deleted cargo would still list.
    where: { status: "ACTIVE", shipment: { deletedAt: null } },
    orderBy: { issuedAt: "asc" },
    select: {
      id: true,
      noteNumber: true,
      customer: { select: { name: true } },
      // No qrToken. It is the secret the whole release control rests on, and
      // the browser has no use for it — the by-hand list opens cargo by note id
      // through a server action instead.
      shipment: {
        select: { trackingNumber: true, packages: true, weightKg: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title={t(locale, "Release cargo")}
        description={t(
          locale,
          "Scan the box. Everything you need to hand it over is on this screen."
        )}
      />

      <ReleaseWorkbench
        initial={initial}
        // Only a real scan pre-satisfies the form. A queue pick does not.
        initialCode={code}
        initialError={failure}
        photosDurable={storageIsDurable()}
        notes={notes.map((note) => ({
          id: note.id,
          noteNumber: note.noteNumber,
          customerName: note.customer.name,
          trackingNumber: note.shipment.trackingNumber,
          packages: note.shipment.packages,
          weightKg: toNumber(note.shipment.weightKg),
        }))}
      />
    </>
  );
}

/**
 * The cargo's own code, for a pick that named it rather than scanned it.
 *
 * Returns the shipment's `qrToken` so the one resolver answers every entry
 * point identically — a queue pick and a camera read reach the same screen
 * through the same code path, and cannot disagree about what a held or
 * short-shipped consignment looks like.
 */
async function tokenFor({ note, open }: { note?: string; open?: string }) {
  if (note) {
    const found = await prisma.pickupNote.findUnique({
      where: { noteNumber: note },
      select: { shipment: { select: { qrToken: true } } },
    });
    if (found) return found.shipment.qrToken;
  }
  if (open) {
    const found = await prisma.shipment.findUnique({
      where: { trackingNumber: normaliseCode(open) || open },
      select: { qrToken: true },
    });
    if (found) return found.qrToken;
  }
  return undefined;
}
