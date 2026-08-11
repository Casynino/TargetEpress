import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, User } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { TicketNoteForm, TicketWorkflow } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Ticket") };
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("ticket.manage");
  const { id } = await params;
  const locale = await viewerLocale();

  const [ticket, staff] = await Promise.all([
    prisma.supportTicket.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true, phone: true } },
        shipment: {
          select: {
            trackingNumber: true,
            status: true,
            ...selectText("description"),
          },
        },
        openedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        notes: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["CUSTOMER_CARE", "FINANCE", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!ticket) notFound();

  return (
    <>
      <Link
        href="/app/support/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "All tickets")}
      </Link>

      <PageHeader
        title={ticket.subject}
        description={`${ticket.ticketNumber} · ${t(locale, "opened")} ${formatDateTime(ticket.createdAt, locale)}${
          ticket.openedBy ? ` ${t(locale, "by")} ${ticket.openedBy.name}` : ""
        }`}
        actions={
          <>
            <Badge variant="outline">
              {t(locale, ticket.priority.toLowerCase())}
            </Badge>
            <Badge variant="outline">
              {t(locale, ticket.status.replace(/_/g, " ").toLowerCase())}
            </Badge>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t(locale, "What the customer said")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.body}</p>
          </section>

          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">{t(locale, "Internal notes")}</h2>
              <p className="text-sm text-muted-foreground">
                {t(locale, "Working notes for staff. Never shown to the customer.")}
              </p>
            </header>
            <ul className="divide-y">
              {ticket.notes.map((note) => (
                <li key={note.id} className="p-4">
                  <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.author?.name ?? t(locale, "Someone")} ·{" "}
                    {formatDateTime(note.createdAt, locale)}
                  </p>
                </li>
              ))}
              {ticket.notes.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">
                  {t(locale, "Nothing written down yet.")}
                </li>
              ) : null}
            </ul>
            <div className="border-t p-4">
              <TicketNoteForm ticketId={ticket.id} />
            </div>
          </section>

          {ticket.resolution ? (
            <section className="rounded-xl border border-success/30 bg-success/5 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-success">
                {t(locale, "Resolution")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.resolution}</p>
              {ticket.resolvedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(locale, "Closed")} {formatDateTime(ticket.resolvedAt, locale)}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">{t(locale, "Who this is about")}</h2>
            {ticket.customer ? (
              <Link
                href={`/app/customers/${ticket.customer.id}`}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{ticket.customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.customer.code}
                    {ticket.customer.phone ? ` · ${ticket.customer.phone}` : ""}
                  </p>
                </div>
              </Link>
            ) : (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {ticket.contactName ?? t(locale, "Unknown caller")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ticket.contactPhone ?? t(locale, "No number taken")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(locale, "Not a customer on our books yet.")}
                </p>
              </div>
            )}

            {ticket.shipment ? (
              <Link
                href={`/app/cargo/${ticket.shipment.trackingNumber}`}
                className="mt-3 flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <Package className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-mono text-sm">{ticket.shipment.trackingNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {cargoText(locale, ticket.shipment, "description")}
                  </p>
                </div>
              </Link>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-4 font-semibold">{t(locale, "Move it forward")}</h2>
            <TicketWorkflow
              ticket={{
                id: ticket.id,
                status: ticket.status,
                priority: ticket.priority,
                resolution: ticket.resolution,
                assignedToId: ticket.assignedToId,
              }}
              staff={staff}
            />
          </section>
        </div>
      </div>
    </>
  );
}
