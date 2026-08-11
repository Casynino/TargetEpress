import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
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
  SHIPMENT_INQUIRY: "Shipment inquiry",
  MISSING_CARGO: "Missing cargo",
  DAMAGED_CARGO: "Damaged cargo",
  SOURCING: "Sourcing",
  GENERAL: "General",
  COMPLAINT: "Complaint",
  FEEDBACK: "Feedback",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; priority?: string }>;
}) {
  await requirePermission("ticket.manage");
  const locale = await viewerLocale();
  const { view, priority } = await searchParams;

  const filter =
    STATUS_FILTERS.find((option) => option.key === view) ?? STATUS_FILTERS[0];

  // Narrowing by priority, because the support desk's work list counts the
  // urgent ones and has to be able to hand over exactly those. Without this
  // the parameter was accepted, ignored, and the clerk landed on every open
  // ticket wondering which the link had meant.
  const urgentOnly = priority === "high";

  const [tickets, counts, customers] = await Promise.all([
    prisma.supportTicket.findMany({
      where: {
        status: { in: [...filter.statuses] },
        ...(urgentOnly ? { priority: { in: ["HIGH", "URGENT"] as const } } : {}),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 150,
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
    prisma.supportTicket.groupBy({ by: ["status"], _count: true }),
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

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Every question, complaint and request the desk has taken, and what happened next."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/app/support/tickets?view=${option.key}`}
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
        A ticket queue on a phone.

        Category, Handled by and Opened were switched off below md, xl and lg,
        so a phone showed a subject, a caller and two badges — not who is
        dealing with it or how long it has been sitting. "Whose is this and how
        old is it" is the whole job of a queue.

        A ticket is a thing you act on one at a time, so it gets a card rather
        than a compact register row: subject first, then the caller and their
        number, then the state and the age.
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
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
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
              <span className="text-[11px] text-muted-foreground">
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
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {ticket.customer?.phone ?? ticket.contactPhone ?? "—"}
                </span>
              </div>
              <div className="shrink-0 text-right text-[11px] text-muted-foreground">
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
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                  {t(locale, "No tickets in this view.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
