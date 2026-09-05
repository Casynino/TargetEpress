import Link from "next/link";
import type { Metadata } from "next";
import { Clock, MessageCircle, Phone, QrCode } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { FilterChip } from "@/components/app/filter-chip";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { SearchBox } from "@/components/app/search-box";
import { CancelNoteButton } from "@/components/app/cancel-note-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

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

/** One page of the register. Named because the count line has to say so. */
const PAGE_SIZE = 100;

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
  const locale = await viewerLocale();
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
      take: PAGE_SIZE,
      include: {
        customer: { select: { name: true, phone: true } },
        issuedBy: { select: { name: true } },
        shipment: {
          select: { trackingNumber: true, ...selectText("description") },
        },
      },
    }),
    prisma.pickupNote.groupBy({ by: ["status"], _count: true }),
  ]);

  /* A pill keeps the search and the search keeps the pill — either one dropping
     the other silently is how a clerk ends up reading a list they did not ask
     for. */
  const pillHref = (key: string) => {
    const params = new URLSearchParams();
    if (key) params.set("status", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/app/finance/pickup-notes${qs ? `?${qs}` : ""}`;
  };

  const countFor = (key: string) =>
    key === ""
      ? counts.reduce((sum, row) => sum + row._count, 0)
      : (counts.find((row) => row.status === key)?._count ?? 0);

  /*
    What the box can offer, taken off the rows it is sitting on.

    No lookup, no second query: these are the notes this page just rendered, so
    a suggestion can never point at something the list below cannot show. One
    line per way somebody knows a note — the customer whose boxes are waiting,
    the note number a colleague read out, the tracking number on the box — with
    the phone carried as the customer's hint so a number typed off a call finds
    the name. The component collapses repeats by value, so a customer with four
    notes is one line.

    It is the page's own hundred rows and nothing more, which makes it a
    shortcut through what is on screen rather than an index of the register.
    Typing past it still works: pressing Search asks the database, which reaches
    the whole register.
  */
  const suggestions = notes.flatMap((note) => [
    {
      value: note.customer.name,
      label: note.customer.name,
      hint: note.customer.phone ?? undefined,
    },
    {
      value: note.noteNumber,
      label: note.customer.name,
      hint: note.noteNumber,
    },
    {
      value: note.shipment.trackingNumber,
      label: note.customer.name,
      hint: note.shipment.trackingNumber,
    },
  ]);

  // The oldest note still standing is the one worth a phone call.
  const oldest = notes
    .filter((note) => note.status === "ACTIVE")
    .reduce<Date | null>(
      (worst, note) => (!worst || note.issuedAt < worst ? note.issuedAt : worst),
      null
    );

  return (
    <>
      <FinanceWorkspaceHeader role={user.role} />

      {/* What THIS tab is for. The department's name and its
          actions are in the shared header above; this is the one
          sentence that belongs to the list below. */}
      <p className="mb-4 -mt-2 max-w-3xl text-sm text-muted-foreground">
        {t(locale, "The warehouse's authority to hand cargo over. Issued by Finance the moment a bill is settled — everyone else prints it and rings the customer.")}
      </p>

      {/* Answering "what is still waiting" without pressing anything. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {/* Filters, drawn as filters — see FilterChip. These used to wear the
            tab row's brand fill, so the only lit pill on this page was a
            filter sitting under a row of unlit tabs. */}
        {FILTERS.map((filter) => (
          <FilterChip
            key={filter.label}
            href={pillHref(filter.key)}
            active={active === filter.key}
          >
            {t(locale, filter.label)}
            <span
              className={`rounded-full px-1.5 text-xs font-bold ${
                active === filter.key ? "bg-foreground/15" : "bg-muted"
              }`}
            >
              {countFor(filter.key)}
            </span>
          </FilterChip>
        ))}
      </div>

      {/*
        Search that shows what it can find while you type.

        A counter clerk with the customer in front of them was typing a name
        blind and finding out whether they had spelled it the way it was saved
        only after the page came back empty. The suggestions are the rows on
        this page, so the name is recognised rather than recalled, and picking
        one searches for it. Whichever pill is active rides along in the hidden
        field, so narrowing by customer never quietly widens the status back to
        everything.
      */}
      <div className="mb-5">
        <SearchBox
          className="max-w-xl"
          defaultValue={query ?? ""}
          placeholder={t(
            locale,
            "Note number, customer, phone or tracking number"
          )}
          suggestions={suggestions}
        >
          {active ? <input type="hidden" name="status" value={active} /> : null}
        </SearchBox>
        {query ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {/* A full page of results means there may be more behind it, so it
                says "100+" rather than claiming exactly a hundred matched. */}
            {notes.length === PAGE_SIZE ? `${PAGE_SIZE}+` : notes.length}{" "}
            {t(locale, "of")} {countFor(active)} {t(locale, "match")}
            {" · "}
            <Link
              href={`/app/finance/pickup-notes${active ? `?status=${active}` : ""}`}
              className="underline-offset-2 hover:underline"
            >
              {t(locale, "Clear")}
            </Link>
          </p>
        ) : null}
      </div>

      {active === "ACTIVE" && oldest ? (
        <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-warning" />
          {t(locale, "Oldest has been waiting")}{" "}
          <span className="font-medium text-foreground">
            {formatRelative(oldest, locale)}
          </span>{" "}
          {t(locale, "— storage runs the whole time the cargo is on our floor.")}
        </p>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title={
            query
              ? `${t(locale, "Nothing matches")} “${query}”`
              : t(locale, "Nothing here")
          }
          description={
            query
              ? t(locale, "Try the tracking number, or a shorter search.")
              : t(
                  locale,
                  "A note appears the moment Finance records the payment that settles a bill."
                )
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
                <TableHead>{t(locale, "Note")}</TableHead>
                <TableHead>{t(locale, "Customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t(locale, "Cargo")}</TableHead>
                <TableHead className="text-right">{t(locale, "Paid")}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  {t(locale, "Waiting")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Reach them")}</TableHead>
                <TableHead className="text-right">{t(locale, "Note")}</TableHead>
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
                        className="block font-mono text-xs text-muted-foreground tabular hover:text-brand"
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
                          className="text-xs font-normal"
                        >
                          {note.status === "ACTIVE"
                            ? t(locale, "not collected")
                            : t(locale, note.status.toLowerCase())}
                        </Badge>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {note.customer.phone}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell className="hidden max-w-[16rem] py-2.5 lg:table-cell">
                      <span className="block truncate text-xs text-muted-foreground">
                        {cargoText(locale, note.shipment, "description")}
                      </span>
                      <span className="block text-xs text-muted-foreground/70">
                        {t(locale, "issued by")} {note.issuedBy?.name ?? "—"}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {formatMoney(note.amountPaid, note.currency)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-right text-xs sm:table-cell">
                      {waiting ? (
                        <span className="font-medium text-warning">
                          {formatRelative(note.issuedAt, locale)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatDate(note.issuedAt, locale)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      {/* A press, not something to copy out. This desk rings
                          these people all day — and often from a phone, where
                          two 28px squares 4px apart make "Call" and "WhatsApp"
                          a coin toss. Thumb-sized below sm, desk-sized above. */}
                      {digits ? (
                        <span className="inline-flex gap-2 sm:gap-1">
                          <IconHint label={t(locale, "Call them")}>
                            <a
                              href={`tel:${note.customer.phone}`}
                              aria-label={`${t(locale, "Call")} ${note.customer.name}`}
                              className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-md border transition-colors hover:border-brand/40 hover:text-brand sm:h-7 sm:w-7"
                            >
                              <Phone className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            </a>
                          </IconHint>
                          <IconHint label={t(locale, "Notify on WhatsApp")}>
                            <a
                              href={`https://wa.me/${digits}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`WhatsApp ${note.customer.name}`}
                              className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-md border transition-colors hover:border-success/40 hover:text-success sm:h-7 sm:w-7"
                            >
                              <MessageCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            </a>
                          </IconHint>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, "no phone")}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <Link
                          href={`/app/finance/pickup-notes/${note.id}`}
                          className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90 sm:min-h-0 sm:px-3 sm:py-1.5"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          {t(locale, "Print")}
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
