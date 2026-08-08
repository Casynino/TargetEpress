import Link from "next/link";
import type { Metadata } from "next";
import { Clock, MessageCircle, Phone, QrCode, Search } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { CancelNoteButton } from "@/components/app/cancel-note-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Pickup notes" };

const TONE = {
  ACTIVE: "brand",
  USED: "success",
  CANCELLED: "muted",
} as const;

const FILTERS = [
  { key: "ACTIVE", label: "Waiting to be collected" },
  { key: "USED", label: "Collected" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "", label: "Everything" },
] as const;

/**
 * The register of cargo cleared to leave.
 *
 * An ACTIVE note is not an archive entry — it is a customer who has paid and
 * whose boxes are still on our floor, accruing storage and taking space. So the
 * page leads with how long each has been standing and gives the phone number a
 * press rather than making somebody copy it out. That is the actual job here:
 * ring them and get the cargo gone.
 *
 * The filter was a dropdown and a Filter button, which is two actions to answer
 * "what is still waiting". Pills with counts answer it without pressing
 * anything.
 */
export default async function PickupNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  // Reading the register is not issuing from it. Support answers "has my
  // note been issued?" all day and should not need Finance to look.
  const user = await requirePermission("pickupNote.view");
  const { status, q } = await searchParams;
  const query = q?.trim();

  const active = FILTERS.some((f) => f.key === status) ? status! : "ACTIVE";
  const mayCancel = can(user.role, "pickupNote.cancel");

  const where = {
    ...(active ? { status: active as keyof typeof TONE } : {}),
    ...(query
      ? {
          OR: [
            { noteNumber: { contains: query, mode: "insensitive" as const } },
            { customer: { name: { contains: query, mode: "insensitive" as const } } },
            { customer: { phone: { contains: query, mode: "insensitive" as const } } },
            {
              shipment: {
                trackingNumber: { contains: query, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [notes, counts] = await Promise.all([
    prisma.pickupNote.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true, phone: true } },
        issuedBy: { select: { name: true } },
        shipment: { select: { trackingNumber: true, description: true } },
      },
    }),
    prisma.pickupNote.groupBy({ by: ["status"], _count: true }),
  ]);

  const countFor = (key: string) =>
    key === ""
      ? counts.reduce((sum, row) => sum + row._count, 0)
      : (counts.find((row) => row.status === key)?._count ?? 0);

  // The oldest note still standing is the one worth a phone call.
  const oldest = notes
    .filter((note) => note.status === "ACTIVE")
    .reduce<Date | null>(
      (worst, note) => (!worst || note.issuedAt < worst ? note.issuedAt : worst),
      null
    );

  return (
    <>
      <PageHeader
        title="Pickup notes"
        description="The warehouse's authority to hand cargo over. Issued by Finance the moment a bill is settled — everyone else prints it and rings the customer."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* Answering "what is still waiting" without pressing anything. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={`/app/finance/pickup-notes${filter.key ? `?status=${filter.key}` : ""}`}
            className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active === filter.key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {filter.label}
            <span
              className={`rounded-full px-1.5 text-[10px] font-bold ${
                active === filter.key ? "bg-white/20" : "bg-muted"
              }`}
            >
              {countFor(filter.key)}
            </span>
          </Link>
        ))}
      </div>

      <form className="mb-5" action="/app/finance/pickup-notes">
        {active ? <input type="hidden" name="status" value={active} /> : null}
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query ?? ""}
            placeholder="Note number, customer, phone or tracking number"
            className="h-11 pl-9"
          />
        </div>
      </form>

      {active === "ACTIVE" && oldest ? (
        <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-warning" />
          Oldest has been waiting{" "}
          <span className="font-medium text-foreground">
            {formatRelative(oldest)}
          </span>{" "}
          — storage runs the whole time the cargo is on our floor.
        </p>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title={query ? `Nothing matches “${query}”` : "Nothing here"}
          description={
            query
              ? "Try the tracking number, or a shorter search."
              : "A note appears the moment Finance records the payment that settles a bill."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          {/* A table, not cards. Cards were four to a screen and this register
              runs to hundreds — a busy counter needs to run its eye down one
              column, not scroll through boxes. Everything that was on a card is
              still here, in the order somebody scanning for one customer reads
              it. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Note</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  Waiting
                </TableHead>
                <TableHead className="text-right">Reach them</TableHead>
                <TableHead className="text-right">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((note) => {
                const waiting = note.status === "ACTIVE";
                const digits = note.customer.phone?.replace(/[^0-9]/g, "") ?? "";
                return (
                  <TableRow key={note.id} className="group">
                    <TableCell className="whitespace-nowrap py-2.5">
                      <span className="block font-mono text-xs font-semibold tabular">
                        {note.noteNumber}
                      </span>
                      <Link
                        href={`/app/cargo/${note.shipment.trackingNumber}`}
                        className="block font-mono text-[11px] text-muted-foreground tabular hover:text-brand"
                      >
                        {note.shipment.trackingNumber}
                      </Link>
                    </TableCell>

                    <TableCell className="min-w-[11rem] py-2.5">
                      <span className="block truncate text-sm font-medium">
                        {note.customer.name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Badge
                          variant={TONE[note.status]}
                          className="text-[10px] font-normal"
                        >
                          {note.status === "ACTIVE"
                            ? "not collected"
                            : note.status.toLowerCase()}
                        </Badge>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {note.customer.phone}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell className="hidden max-w-[16rem] py-2.5 lg:table-cell">
                      <span className="block truncate text-xs text-muted-foreground">
                        {note.shipment.description}
                      </span>
                      <span className="block text-[11px] text-muted-foreground/70">
                        issued by {note.issuedBy?.name ?? "—"}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {formatMoney(note.amountPaid, note.currency)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-right text-xs sm:table-cell">
                      {waiting ? (
                        <span className="font-medium text-warning">
                          {formatRelative(note.issuedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatDate(note.issuedAt)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      {/* A press, not something to copy out. This desk rings
                          these people all day. */}
                      {digits ? (
                        <span className="inline-flex gap-1">
                          <a
                            href={`tel:${note.customer.phone}`}
                            aria-label={`Call ${note.customer.name}`}
                            className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:border-brand/40 hover:text-brand"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${note.customer.name}`}
                            className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:border-success/40 hover:text-success"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          no phone
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <Link
                          href={`/app/finance/pickup-notes/${note.id}`}
                          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Print
                        </Link>
                        {/* Offered only to somebody who may actually do it.
                            This was shown to Customer Support, who hold
                            neither pickupNote.cancel nor pickupNote.issue —
                            pressing it could only ever have failed. */}
                        {note.status === "ACTIVE" && mayCancel ? (
                          <CancelNoteButton noteId={note.id} />
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
