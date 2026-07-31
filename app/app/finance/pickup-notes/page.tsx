import Link from "next/link";
import type { Metadata } from "next";
import { QrCode } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { CancelNoteButton } from "@/components/app/cancel-note-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Pickup notes" };

const TONE = {
  ACTIVE: "brand",
  USED: "success",
  CANCELLED: "muted",
} as const;

export default async function PickupNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("pickupNote.issue");
  const { status } = await searchParams;

  const notes = await prisma.pickupNote.findMany({
    where: status && status in TONE ? { status: status as keyof typeof TONE } : {},
    orderBy: { issuedAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true, phone: true } },
      issuedBy: { select: { name: true } },
      shipment: { select: { trackingNumber: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Pickup notes"
        description="A pickup note is the warehouse's authority to hand cargo over. Only Finance can issue one."
      />

      <form className="mb-4 flex gap-2" action="/app/finance/pickup-notes">
        <NativeSelect name="status" defaultValue={status ?? ""} className="sm:w-56">
          <option value="">All notes</option>
          <option value="ACTIVE">Active</option>
          <option value="USED">Used</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {notes.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No pickup notes"
          description="Issue one from a shipment once its invoice is settled and the cargo is checked in."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border bg-card p-5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold tabular">
                    {note.noteNumber}
                  </p>
                  <Link
                    href={`/app/cargo/${note.shipment.trackingNumber}`}
                    className="font-mono text-xs text-muted-foreground tabular hover:text-brand"
                  >
                    {note.shipment.trackingNumber}
                  </Link>
                </div>
                <Badge variant={TONE[note.status]}>
                  {note.status.toLowerCase()}
                </Badge>
              </div>

              <p className="mt-3 text-sm font-medium">{note.customer.name}</p>
              <p className="text-xs text-muted-foreground">
                {note.customer.phone}
              </p>

              <p className="mt-3 font-mono text-sm tabular">
                {formatMoney(note.amountPaid, note.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                Issued {formatDateTime(note.issuedAt)} by{" "}
                {note.issuedBy?.name ?? "—"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/app/finance/pickup-notes/${note.id}`}>
                    Open note
                  </Link>
                </Button>
                {note.status === "ACTIVE" ? (
                  <CancelNoteButton noteId={note.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
