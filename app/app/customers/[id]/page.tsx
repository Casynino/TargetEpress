import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";

import { CustomerNotesForm } from "@/components/app/customer-notes";
import { MessageComposer } from "@/components/app/message-composer";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import {
  CHANNEL_LABELS,
  MESSAGE_KIND_LABELS,
  composeMessage,
  whatsappLink,
} from "@/lib/messages";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { customerProfile } from "@/lib/support";

export const metadata: Metadata = { title: "Customer" };

/**
 * One customer, everything about them.
 *
 * Built so a clerk with a customer on the phone never has to open a second
 * screen: balance, every shipment, every invoice, every pickup and every
 * previous conversation, in that order.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("customer.view");
  const { id } = await params;

  const profile = await customerProfile(id);
  if (!profile) notFound();

  const { customer, stats } = profile;
  const showMoney = can(user.role, "finance.view");
  /**
   * Collecting from the customer's own page.
   *
   * Somebody searches a customer, opens them, and sees a bill with money owed
   * against it — that is the moment the payment gets recorded, not after
   * navigating back out to a queue and finding the same row again. Finance and
   * the CEO record it directly; Customer Support hands the proof up. Both
   * arrive from the same button on the same row.
   */
  const rateRow = await currentRate();
  const profileRate = rateRow ? toNumber(rateRow.rate) : null;
  const mayRecord = can(user.role, "payment.record");
  const mayCollect = can(user.role, "payment.submit");
  const canMessage = can(user.role, "message.send");

  // Compose every template up front so the composer can switch between them
  // without a round trip — the desk is often mid-call.
  const latestShipment = customer.shipments[0] ?? null;
  const templates = (
    Object.keys(MESSAGE_KIND_LABELS) as (keyof typeof MESSAGE_KIND_LABELS)[]
  ).map((kind) => ({
    kind,
    label: MESSAGE_KIND_LABELS[kind],
    body: composeMessage(kind, {
      customerName: customer.name,
      trackingNumber: latestShipment?.trackingNumber ?? null,
      description: latestShipment?.description ?? null,
      batchNumber: latestShipment?.batch?.batchNumber ?? null,
      invoiceNumber: latestShipment?.invoice?.invoiceNumber ?? null,
      amountUsd: latestShipment?.invoice
        ? Math.max(
            0,
            toNumber(latestShipment.invoice.total) -
              toNumber(latestShipment.invoice.amountPaid)
          )
        : null,
    }),
  }));

  return (
    <>
      <Link
        href="/app/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All customers
      </Link>

      <PageHeader
        title={customer.name}
        description={`${customer.code}${customer.city ? ` · ${customer.city}` : ""}${
          customer.createdAt ? ` · customer since ${formatDate(customer.createdAt)}` : ""
        }`}
        actions={
          customer.phone ? (
            <>
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Phone className="h-4 w-4" />
                {customer.phone}
              </a>
              <a
                href={whatsappLink(customer.phone, `Habari ${customer.name.split(" ")[0]},`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </>
          ) : null
        }
      />

      {/* Headline numbers */}
      <dl className="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total shipments", value: String(stats.total) },
          { label: "Active", value: String(stats.active) },
          { label: "Completed", value: String(stats.completed) },
          ...(showMoney
            ? [
                {
                  label: "Outstanding",
                  // Shillings first: this is the figure quoted down the phone.
                  value: profileRate
                    ? `TZS ${Math.round(stats.outstanding * profileRate).toLocaleString("en-US")}`
                    : formatUsd(stats.outstanding),
                  hint: profileRate ? formatUsd(stats.outstanding) : undefined,
                  tone: stats.outstanding > 0 ? "text-destructive" : "text-success",
                },
                {
                  label: "Paid to date",
                  value: profileRate
                    ? `TZS ${Math.round(stats.lifetimeValue * profileRate).toLocaleString("en-US")}`
                    : formatUsd(stats.lifetimeValue),
                  hint: profileRate ? formatUsd(stats.lifetimeValue) : undefined,
                },
              ]
            : []),
        ].map((item) => (
          <div key={item.label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd
              className={`mt-1 font-display text-xl font-bold tabular-nums ${
                "tone" in item ? (item.tone as string) : ""
              }`}
            >
              {item.value}
            </dd>
            {/* The invoice's own figure, underneath. Present so a clerk can
                match what they are saying against the bill that was sent. */}
            {"hint" in item && item.hint ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {item.hint as string}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Shipments */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">Shipments</h2>
            </header>
            {/*
              A customer's shipments, on a phone.

              Status was hidden below md and Registered below lg, so the two
              questions this list answers — where is it, and how long ago —
              were both switched off on the screen most likely to be open while
              a customer is on the phone asking exactly that.

              A card each: tracking and cargo, the status badge, and the money
              with its Record payment action kept at full width, because that
              is the thing somebody opens this page to do.
            */}
            <ul className="divide-y md:hidden">
              {customer.shipments.map((shipment) => {
                const outstanding = shipment.invoice
                  ? Math.max(
                      0,
                      toNumber(shipment.invoice.total) -
                        toNumber(shipment.invoice.amountPaid)
                    )
                  : null;
                return (
                  <li key={shipment.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/app/cargo/${shipment.trackingNumber}`}
                          className="font-mono text-sm font-semibold hover:text-brand"
                        >
                          {shipment.trackingNumber}
                        </Link>
                        <p className="mt-0.5 line-clamp-2 text-sm">
                          {shipment.description}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatWeight(shipment.weightKg)} · {shipment.packages} pkg
                          {shipment.batch ? ` · ${shipment.batch.batchNumber}` : ""}
                        </p>
                      </div>
                      <ShipmentStatusBadge status={shipment.status} />
                    </div>

                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Registered {formatDate(shipment.registeredAt)}
                    </p>

                    {showMoney ? (
                      <div className="mt-3 border-t pt-3">
                        {shipment.invoice ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                href={`/app/finance/invoices/${shipment.invoice.id}`}
                                className="font-mono text-xs hover:text-brand"
                              >
                                {shipment.invoice.invoiceNumber}
                              </Link>
                              <span
                                className={`ml-2 text-xs tabular-nums ${
                                  outstanding && outstanding > 0
                                    ? "text-destructive"
                                    : "text-success"
                                }`}
                              >
                                {outstanding && outstanding > 0
                                  ? `${formatUsd(outstanding)} owed`
                                  : "paid"}
                              </span>
                            </div>
                            {outstanding !== null &&
                            outstanding > 0 &&
                            shipment.invoice.status !== "DRAFT" &&
                            (mayRecord || mayCollect) ? (
                              <Link
                                href={
                                  mayRecord
                                    ? `/app/cargo/${shipment.trackingNumber}`
                                    : `/app/collections/record/${shipment.invoice.id}`
                                }
                                className="focus-ring inline-flex items-center rounded-full bg-brand px-3 py-1.5 text-[11px] font-semibold text-brand-foreground"
                              >
                                Record payment
                              </Link>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            not billed
                          </span>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Tracking</th>
                    <th className="p-3 font-medium">Cargo</th>
                    <th className="hidden p-3 font-medium md:table-cell">Status</th>
                    {showMoney ? <th className="p-3 font-medium">Invoice</th> : null}
                    <th className="hidden p-3 font-medium lg:table-cell">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.shipments.map((shipment) => {
                    const outstanding = shipment.invoice
                      ? Math.max(
                          0,
                          toNumber(shipment.invoice.total) -
                            toNumber(shipment.invoice.amountPaid)
                        )
                      : null;
                    return (
                      <tr key={shipment.id} className="border-t align-top">
                        <td className="p-3">
                          <Link
                            href={`/app/cargo/${shipment.trackingNumber}`}
                            className="font-mono text-xs hover:text-brand hover:underline"
                          >
                            {shipment.trackingNumber}
                          </Link>
                          {shipment.batch ? (
                            <div className="text-[11px] text-muted-foreground">
                              {shipment.batch.batchNumber}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <div className="max-w-[14rem] truncate">
                            {shipment.description}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatWeight(shipment.weightKg)} · {shipment.packages} pkg
                          </div>
                        </td>
                        <td className="hidden p-3 md:table-cell">
                          <ShipmentStatusBadge status={shipment.status} />
                        </td>
                        {showMoney ? (
                          <td className="p-3">
                            {shipment.invoice ? (
                              <>
                                <Link
                                  href={`/app/finance/invoices/${shipment.invoice.id}`}
                                  className="font-mono text-xs hover:text-brand hover:underline"
                                >
                                  {shipment.invoice.invoiceNumber}
                                </Link>
                                <div
                                  className={`text-xs tabular-nums ${
                                    outstanding && outstanding > 0
                                      ? "text-destructive"
                                      : "text-success"
                                  }`}
                                >
                                  {outstanding && outstanding > 0
                                    ? `${formatUsd(outstanding)} owed`
                                    : "paid"}
                                </div>
                                {!shipment.invoice.sentAt ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 border-warning/40 text-[10px] text-warning"
                                  >
                                    never sent
                                  </Badge>
                                ) : null}
                                {outstanding !== null &&
                                outstanding > 0 &&
                                shipment.invoice.status !== "DRAFT" &&
                                (mayRecord || mayCollect) ? (
                                  <Link
                                    href={
                                      mayRecord
                                        ? `/app/cargo/${shipment.trackingNumber}`
                                        : `/app/collections/record/${shipment.invoice.id}`
                                    }
                                    className="focus-ring mt-1.5 inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                                  >
                                    Record payment
                                  </Link>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                not billed
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                          {formatDate(shipment.registeredAt)}
                        </td>
                      </tr>
                    );
                  })}
                  {customer.shipments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showMoney ? 5 : 4}
                        className="p-8 text-center text-sm text-muted-foreground"
                      >
                        No shipments yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* Contact history */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">Contact history</h2>
              <p className="text-sm text-muted-foreground">
                Everything we have told this customer, and when.
              </p>
            </header>
            <ul className="divide-y">
              {customer.messages.map((message) => (
                <li key={message.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {MESSAGE_KIND_LABELS[message.kind] ?? message.kind}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {CHANNEL_LABELS[message.channel] ?? message.channel} ·{" "}
                      {formatDateTime(message.sentAt)}
                      {message.sentBy ? ` · ${message.sentBy.name}` : ""}
                      {message.shipment ? ` · ${message.shipment.trackingNumber}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {message.body}
                  </p>
                </li>
              ))}
              {customer.messages.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  We have not contacted this customer through the system yet.
                </li>
              ) : null}
            </ul>
          </section>

          {/* Pickups, tickets, requests */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border bg-card shadow-soft">
              <header className="border-b p-4">
                <h2 className="font-semibold">Pickup history</h2>
              </header>
              <ul className="divide-y">
                {customer.pickupNotes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-mono text-xs">{note.noteNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {note.shipment.trackingNumber} · {formatDate(note.issuedAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {note.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
                {customer.pickupNotes.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    Nothing collected yet.
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border bg-card shadow-soft">
              <header className="border-b p-4">
                <h2 className="font-semibold">Tickets &amp; requests</h2>
              </header>
              <ul className="divide-y">
                {customer.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/app/support/tickets/${ticket.id}`}
                      className="block p-3 transition-colors hover:bg-accent/40"
                    >
                      <p className="truncate text-sm">{ticket.subject}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {ticket.ticketNumber} · {ticket.status.toLowerCase()}
                      </p>
                    </Link>
                  </li>
                ))}
                {customer.requests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/app/support/sourcing/${request.id}`}
                      className="block p-3 transition-colors hover:bg-accent/40"
                    >
                      <p className="truncate text-sm">{request.product}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {request.requestNumber} · {request.status.toLowerCase()}
                      </p>
                    </Link>
                  </li>
                ))}
                {customer.tickets.length === 0 && customer.requests.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    Nothing open.
                  </li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="space-y-3 text-sm">
              {[
                { label: "Customer ID", value: customer.code },
                { label: "Phone", value: customer.phone ?? "Not on file" },
                { label: "Other phone", value: customer.altPhone ?? "—" },
                { label: "Email", value: customer.email ?? "—" },
                { label: "City", value: customer.city ?? "—" },
                { label: "Address", value: customer.address ?? "—" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="text-right font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {canMessage ? (
            <section className="rounded-xl border bg-card p-5 shadow-soft">
              <h2 className="mb-1 font-semibold">Contact this customer</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Pick the message, edit it, send it from your WhatsApp, then record
                it here.
              </p>
              <MessageComposer
                customerId={customer.id}
                customerName={customer.name}
                customerPhone={customer.phone}
                shipmentId={latestShipment?.id ?? null}
                invoiceId={latestShipment?.invoice?.id ?? null}
                templates={templates}
                defaultKind="GENERAL"
                whatsappBase={
                  customer.phone
                    ? whatsappLink(customer.phone, "").split("?")[0]
                    : null
                }
              />
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">Notes</h2>
            <CustomerNotesForm
              customerId={customer.id}
              notes={customer.notes}
              canEdit={can(user.role, "customer.manage")}
            />
          </section>
        </div>
      </div>
    </>
  );
}
