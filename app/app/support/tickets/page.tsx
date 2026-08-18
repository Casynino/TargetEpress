import type { Metadata } from "next";
import type { Prisma, TicketPriority } from "@prisma/client";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { NewTicketForm } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Tickets") };
}

const STATUS_FILTERS = [
  { key: "open", label: "Open", statuses: ["OPEN", "IN_PROGRESS"] },
  { key: "waiting", label: "Waiting for customer", statuses: ["WAITING_CUSTOMER"] },
  { key: "resolved", label: "Resolved", statuses: ["RESOLVED", "CLOSED"] },
  {
    key: "all",
    label: "Everything",
    statuses: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"],
  },
] as const;

/**
 * Priority, as the desk actually asks for it.
 *
 * "high" is not a priority — it is HIGH and URGENT together, which is what the
 * support dashboard's urgent counter and the attention list already link to. It
 * keeps its name because those links are in the wild; the four levels sit
 * beneath it so the same control can also do the narrower job.
 */
const PRIORITY_FILTERS: {
  key: string;
  label: string;
  priorities: readonly TicketPriority[];
}[] = [
  { key: "", label: "Any priority", priorities: [] },
  { key: "high", label: "High & urgent", priorities: ["HIGH", "URGENT"] },
  { key: "URGENT", label: "Urgent only", priorities: ["URGENT"] },
  { key: "HIGH", label: "High only", priorities: ["HIGH"] },
  { key: "NORMAL", label: "Normal", priorities: ["NORMAL"] },
  { key: "LOW", label: "Low", priorities: ["LOW"] },
];

/** Enough tickets to work through, few enough to render fast. */
const PAGE_SIZE = 40;

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "border-destructive/40 text-destructive",
  HIGH: "border-warning/40 text-warning",
  NORMAL: "text-muted-foreground",
  LOW: "text-muted-foreground",
};

const STATUS_TONE: Record<string, string> = {
  OPEN: "border-brand/40 text-brand",
  IN_PROGRESS: "border-info/40 text-info",
  WAITING_CUSTOMER: "border-warning/40 text-warning",
  RESOLVED: "border-success/40 text-success",
  CLOSED: "text-muted-foreground",
};

const CATEGORY_LABEL: Record<string, string> = {
  PRICE_INQUIRY: "Price inquiry",
  SHIPMENT_INQUIRY: "Cargo inquiry",
  MISSING_CARGO: "Missing cargo",
  DAMAGED_CARGO: "Damaged cargo",
  SOURCING: "Sourcing",
  GENERAL: "General",
  COMPLAINT: "Complaint",
  FEEDBACK: "Feedback",
};

/**
 * The queue.
 *
 * Rebuilt for a desk that takes calls all day. The list used to stop at 150
 * rows with nothing said about it — no total, no paging — so on a busy month
 * the 151st ticket did not exist as far as this screen was concerned, and
 * nobody could tell, because the screen looked exactly the same as one showing
 * everything. There was also no way to find a ticket somebody was asking about
 * on the phone: the chips narrow, but "TKT-2026-000412" or a caller's name had
 * to be hunted for by eye.
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    priority?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requirePermission("ticket.manage");
  const locale = await viewerLocale();
  const params = await searchParams;

  const filter =
    STATUS_FILTERS.find((option) => option.key === params.view) ?? STATUS_FILTERS[0];

  // Narrowing by priority, because the support desk's work list counts the
  // urgent ones and has to be able to hand over exactly those. Without this
  // the parameter was accepted, ignored, and the clerk landed on every open
  // ticket wondering which the link had meant.
  const priorityFilter =
    PRIORITY_FILTERS.find((option) => option.key && option.key === params.priority) ??
    PRIORITY_FILTERS[0];
  const priority = priorityFilter.key;
  const search = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  const priorityWhere: Prisma.SupportTicketWhereInput =
    priorityFilter.priorities.length > 0
      ? { priority: { in: [...priorityFilter.priorities] } }
      : {};

  /*
    Finding one ticket among hundreds.

    A clerk with a customer on the line has one of four things: the ticket
    number off an earlier message, the caller's name, roughly what it was
    about, or the tracking number of the cargo it concerns. All of them are
    searched at once rather than making them guess which field the box means.
    contactName is in there too — a walk-in with no customer record is exactly
    the ticket whose caller is hardest to find again.
  */
  const searchWhere: Prisma.SupportTicketWhereInput = search
    ? {
        OR: [
          { ticketNumber: { contains: search, mode: "insensitive" } },
          { subject: { contains: search, mode: "insensitive" } },
          { body: { contains: search, mode: "insensitive" } },
          { contactName: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
          { shipment: { trackingNumber: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};

  const listWhere: Prisma.SupportTicketWhereInput = {
    status: { in: [...filter.statuses] },
    ...priorityWhere,
    ...searchWhere,
  };

  const [tickets, listCount, counts, customers] = await Promise.all([
    prisma.supportTicket.findMany({
      where: listWhere,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        contactName: true,
        contactPhone: true,
        customer: { select: { id: true, name: true, phone: true } },
        shipment: { select: { trackingNumber: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.supportTicket.count({ where: listWhere }),
    /* The chip counts are taken under the search and the priority, not over
       every ticket ever raised. A chip that reads 12 and then shows an empty
       list is how somebody decides the filters are broken. */
    prisma.supportTicket.groupBy({
      by: ["status"],
      where: { ...priorityWhere, ...searchWhere },
      _count: true,
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const countFor = (statuses: readonly string[]) =>
    counts
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count, 0);

  /** Every control keeps the others, so narrowing never silently resets. */
  const link = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      view: filter.key === STATUS_FILTERS[0].key ? undefined : filter.key,
      priority: priority || undefined,
      q: search || undefined,
      /* Any change of filter starts again at page one — page 3 of a different
         list is a blank screen that looks like a bug. */
      page: undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/app/support/tickets${s ? `?${s}` : ""}`;
  };

  const filtered = Boolean(search || priority);
  const pages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));
  const firstOnPage = listCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, listCount);

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Every question, complaint and request the desk has taken, and what happened next."
      />

      {/*
        The four views.

        Each chip used to be built as ?view=… and nothing else, which threw away
        the priority the reader had arrived with: following "12 urgent" from the
        dashboard and then clicking "Everything" quietly widened the list back
        to every ticket at every priority. Chips go through link() now, so a
        chip changes one thing and keeps the rest.
      */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={link({
              view: option.key === STATUS_FILTERS[0].key ? undefined : option.key,
            })}
            aria-current={option.key === filter.key ? "true" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              option.key === filter.key
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:bg-accent"
            }`}
          >
            {t(locale, option.label)}
            <span
              className={`rounded-full px-1.5 text-xs tabular-nums ${
                option.key === filter.key ? "bg-white/20" : "bg-muted text-muted-foreground"
              }`}
            >
              {countFor(option.statuses)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-6">
        <NewTicketForm customers={customers} />
      </div>

      {/*
        Find one, or narrow to a priority.

        Search is a GET form so the result is a linkable URL — a clerk can paste
        "the search that finds it" into a handover note. The view rides in a
        hidden field and the priority select sits inside the same form, so
        searching inside "Waiting for customer" at "Urgent only" throws neither
        of them away.

        And it shows what it can find WHILE YOU TYPE. A clerk with a caller on
        the line is recognising "TKT-2026-000412" or a name, not recalling how it
        was spelled — typing blind and pressing Search only tells you the guess
        was wrong after the page has reloaded. The suggestions are this page's
        own ticket rows, so they are instant and can never disagree with the list
        underneath; they cover the visible page rather than the whole queue,
        which is why the box still submits to the server search over every
        ticket on file.
      */}
      <SearchBox
        className="mb-3 rounded-xl border bg-card p-3"
        defaultValue={search}
        placeholder={t(
          locale,
          "Ticket number, customer, what it was about, a tracking number…"
        )}
        suggestions={tickets.flatMap((ticket) => {
          /* Whoever rang: the account when there is one, otherwise the walk-in
             name typed onto the ticket — that caller is the hardest of all to
             find again, because nothing else on file carries their name. */
          const caller = ticket.customer?.name ?? ticket.contactName;
          const phone = ticket.customer?.phone ?? ticket.contactPhone ?? undefined;
          return [
            {
              value: ticket.ticketNumber,
              label: ticket.subject,
              hint: ticket.ticketNumber,
            },
            {
              value: ticket.subject,
              label: ticket.subject,
              hint: t(locale, CATEGORY_LABEL[ticket.category] ?? ticket.category),
            },
            ...(caller ? [{ value: caller, label: caller, hint: phone }] : []),
            ...(ticket.shipment
              ? [
                  {
                    value: ticket.shipment.trackingNumber,
                    label: ticket.subject,
                    hint: ticket.shipment.trackingNumber,
                  },
                ]
              : []),
          ];
        })}
      >
        {filter.key === STATUS_FILTERS[0].key ? null : (
          <input type="hidden" name="view" value={filter.key} />
        )}

        <select
          name="priority"
          defaultValue={priority}
          aria-label={t(locale, "Priority")}
          className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
        >
          {PRIORITY_FILTERS.map((option) => (
            <option key={option.key} value={option.key}>
              {t(locale, option.label)}
            </option>
          ))}
        </select>
      </SearchBox>

      {/* What the reader is looking at — never a list that silently stops. The
          way back out lives here now, beside the count that shows it is needed,
          rather than as a fifth control competing inside the search row. */}
      <p className="mb-2 text-xs text-muted-foreground">
        {listCount === 0
          ? t(locale, "Nothing matches.")
          : `${t(locale, "Showing")} ${firstOnPage}–${lastOnPage} ${t(locale, "of")} ${listCount} ${t(locale, listCount === 1 ? "ticket" : "tickets")}`}
        {filtered ? ` · ${t(locale, "filtered")}` : ""}
        {filtered ? (
          <>
            {" · "}
            <Link
              href={link({ q: undefined, priority: undefined })}
              className="underline-offset-2 hover:underline"
            >
              {t(locale, "Clear the filters")}
            </Link>
          </>
        ) : null}
      </p>

      {/*
        One empty state for both shapes of the list.

        The phone list rendered nothing at all when the queue was empty — no
        message, just the new-ticket form and white space, while the table below
        it (hidden on a phone) carried the only explanation. Hoisting it out
        means the two cannot drift apart again.
      */}
      {tickets.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? t(locale, "Nothing matches those filters")
              : t(locale, "No tickets in this view.")
          }
          description={
            filtered
              ? t(locale, "Try another view, or clear the filters above.")
              : t(
                  locale,
                  "Every call, complaint and question the desk takes belongs here — that is how the next person picks it up."
                )
          }
        />
      ) : (
        <>
          {/*
            A ticket queue on a phone.

            Category, Handled by and Opened were switched off below md, xl and
            lg, so a phone showed a subject, a caller and two badges — not who
            is dealing with it or how long it has been sitting. "Whose is this
            and how old is it" is the whole job of a queue.

            A ticket is a thing you act on one at a time, so it gets a card
            rather than a compact register row: subject first, then the caller
            and their number, then the state and the age.
          */}
          <ul className="space-y-3 md:hidden">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="panel p-4">
                <Link
                  href={`/app/support/tickets/${ticket.id}`}
                  className="block font-medium hover:text-brand"
                >
                  {ticket.subject}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {ticket.ticketNumber}
                  {ticket.shipment ? ` · ${ticket.shipment.trackingNumber}` : ""}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={PRIORITY_TONE[ticket.priority] ?? ""}>
                    {t(locale, ticket.priority.toLowerCase())}
                  </Badge>
                  <Badge variant="outline" className={STATUS_TONE[ticket.status] ?? ""}>
                    {t(locale, ticket.status.replace(/_/g, " ").toLowerCase())}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t(locale, CATEGORY_LABEL[ticket.category] ?? ticket.category)}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3 text-xs">
                  <div className="min-w-0">
                    {ticket.customer ? (
                      <Link
                        href={`/app/customers/${ticket.customer.id}`}
                        className="block truncate font-medium hover:text-brand"
                      >
                        {ticket.customer.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">
                        {ticket.contactName ?? t(locale, "Unknown caller")}
                      </span>
                    )}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {ticket.customer?.phone ?? ticket.contactPhone ?? "—"}
                    </span>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <span className="block">
                      {ticket.assignedTo?.name ?? t(locale, "Unassigned")}
                    </span>
                    <span className="block">{formatDateTime(ticket.createdAt, locale)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-soft md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t(locale, "Ticket")}</th>
                  <th className="p-3 font-medium">{t(locale, "Customer")}</th>
                  <th className="hidden p-3 font-medium md:table-cell">
                    {t(locale, "Category")}
                  </th>
                  <th className="p-3 font-medium">{t(locale, "Priority")}</th>
                  <th className="p-3 font-medium">{t(locale, "Status")}</th>
                  <th className="hidden p-3 font-medium xl:table-cell">
                    {t(locale, "Handled by")}
                  </th>
                  <th className="hidden p-3 font-medium lg:table-cell">
                    {t(locale, "Opened")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-t align-top">
                    <td className="p-3">
                      <Link
                        href={`/app/support/tickets/${ticket.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {ticket.ticketNumber}
                        {ticket.shipment ? ` · ${ticket.shipment.trackingNumber}` : ""}
                      </div>
                    </td>
                    <td className="p-3">
                      {ticket.customer ? (
                        <Link
                          href={`/app/customers/${ticket.customer.id}`}
                          className="hover:text-brand hover:underline"
                        >
                          {ticket.customer.name}
                        </Link>
                      ) : (
                        <span>{ticket.contactName ?? t(locale, "Unknown caller")}</span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {ticket.customer?.phone ?? ticket.contactPhone ?? "—"}
                      </div>
                    </td>
                    <td className="hidden p-3 text-muted-foreground md:table-cell">
                      {t(locale, CATEGORY_LABEL[ticket.category] ?? ticket.category)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={PRIORITY_TONE[ticket.priority] ?? ""}>
                        {t(locale, ticket.priority.toLowerCase())}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={STATUS_TONE[ticket.status] ?? ""}>
                        {t(locale, ticket.status.replace(/_/g, " ").toLowerCase())}
                      </Badge>
                    </td>
                    <td className="hidden p-3 text-muted-foreground xl:table-cell">
                      {ticket.assignedTo?.name ?? t(locale, "Unassigned")}
                    </td>
                    <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                      {formatDateTime(ticket.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Paging, only when there is more than one page. */}
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page === 2 ? undefined : String(page - 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              ← {t(locale, "Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: String(page + 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {t(locale, "Older")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </>
  );
}
