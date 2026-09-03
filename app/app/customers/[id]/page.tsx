import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";

import { CustomerCreditPanel } from "@/components/app/customer-credit";
import {
  CustomerMergePanel,
  type MergeCandidate,
} from "@/components/app/customer-merge";
import { CustomerNotesForm } from "@/components/app/customer-notes";
import { MessageComposer } from "@/components/app/message-composer";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { customerCreditOutcomes, customerCreditProfile } from "@/lib/credit-queries";
import {
  formatDate,
  formatDateTime,
  formatWeight,
  normalisePhone,
  toNumber,
} from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import {
  CHANNEL_LABELS,
  MESSAGE_KIND_LABELS,
  composeMessage,
  whatsappLink,
} from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { customerProfile } from "@/lib/support";
import { cargoText, viewerLocale } from "@/lib/viewer";

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
  const locale = await viewerLocale();
  const { id } = await params;

  const profile = await customerProfile(id);
  if (!profile) notFound();

  const { customer, stats } = profile;
  const showMoney = can(user.role, "finance.view");

  /*
    Other records that may be this same person.

    Two things create a duplicate here: a name typed twice with different
    capitalisation, and cargo registered from a packing list with no phone
    number at all, which is the only key we match on. Both are found by the
    same query, and both are only ever a suggestion — a shop and its owner
    share a landline, and two brothers share a name, so the page states what it
    counted and leaves the decision to somebody who knows the customer.

    Fetched only for the desks that may act on it; a warehouse reading a
    tracking number off this page has no business being shown a merge.
  */
  const canMerge = can(user.role, "customer.merge");
  /* Empty in, empty out: normalisePhone("") answers "+", which would match
     every record that has no number at all. */
  const digits = customer.phone ? normalisePhone(customer.phone) : "";
  const twins = canMerge
    ? await prisma.customer.findMany({
        where: {
          id: { not: customer.id },
          OR: [
            { name: { equals: customer.name, mode: "insensitive" } },
            ...(digits ? [{ phone: digits }] : []),
          ],
        },
        take: 8,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          _count: { select: { shipments: true, invoices: true } },
        },
      })
    : [];

  const mergeCandidates: MergeCandidate[] = twins.map((twin) => ({
    id: twin.id,
    code: twin.code,
    name: twin.name,
    phone: twin.phone,
    shipments: twin._count.shipments,
    invoices: twin._count.invoices,
    reason:
      digits && twin.phone === digits
        ? t(locale, "Same phone number")
        : t(locale, "Same name"),
  }));
  /**
   * The credit position, for the desks that are allowed to know it.
   *
   * Fetched here rather than inside the panel because a warehouse also opens
   * this page — to read a tracking number off it — and the company's exposure to
   * a customer is not warehouse business. Gating the JSX alone would still have
   * run the query and shipped its figures to the browser.
   *
   * Two calls, both derived: the facility and every credit from
   * `customerCreditProfile`, and the two answers it cannot give from
   * `customerCreditOutcomes` — when the customer last actually PAID (the
   * profile's last-settled row is dated when credit was granted, not when money
   * arrived) and what has been written off.
   */
  const creditView = can(user.role, "credit.view");
  const [rateRow, creditProfile, creditOutcomes] = await Promise.all([
    currentRate(),
    creditView ? customerCreditProfile(id) : Promise.resolve(null),
    creditView ? customerCreditOutcomes(id) : Promise.resolve(null),
  ]);
  const profileRate = rateRow ? toNumber(rateRow.rate) : null;
  /**
   * Collecting from the customer's own page.
   *
   * Somebody searches a customer, opens them, and sees a bill with money owed
   * against it — that is the moment the payment gets recorded, not after
   * navigating back out to a queue and finding the same row again. Finance and
   * the CEO record it directly; Customer Support hands the proof up. Both
   * arrive from the same button on the same row.
   */
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
    label: t(locale, MESSAGE_KIND_LABELS[kind]),
    body: composeMessage(kind, {
      customerName: customer.name,
      trackingNumber: latestShipment?.trackingNumber ?? null,
      // "en", never the viewer's locale: these are Swahili messages for the
      // customer, and the customer is in Tanzania. Resolved against the reader,
      // a Guangzhou desk opening a Dar customer to chase them composed the
      // cargo line in Chinese — the same rule the invoice page already states.
      description: latestShipment
        ? cargoText("en", latestShipment, "description")
        : null,
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
      <PageHeader
        title={customer.name}
        /*
          Was a separate link on its own row above the title, with its own
          arrow and its own margin — and on a phone it sat directly under the
          shell's back control, which already reads "Customers". The same words
          twice, stacked, in a header the owner keeps asking to shorten. It
          moves into the header and stands down below `lg`, where the shell has
          it covered and the row is better spent on the customer's name.
        */
        backTo={{ href: "/app/customers", label: "Customers", mobile: false }}
        description={`${customer.code}${customer.city ? ` · ${customer.city}` : ""}${
          customer.createdAt
            ? ` · ${t(locale, "customer since")} ${formatDate(customer.createdAt, locale)}`
            : ""
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
      <dl className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: t(locale, "Total cargo"), value: String(stats.total) },
          { label: t(locale, "Active"), value: String(stats.active) },
          { label: t(locale, "Completed"), value: String(stats.completed) },
          ...(showMoney
            ? [
                {
                  label: t(locale, "Outstanding"),
                  // Shillings first: this is the figure quoted down the phone.
                  value: profileRate
                    ? `TZS ${Math.round(stats.outstanding * profileRate).toLocaleString("en-US")}`
                    : formatUsd(stats.outstanding),
                  hint: profileRate ? formatUsd(stats.outstanding) : undefined,
                  tone: stats.outstanding > 0 ? "text-destructive" : "text-success",
                },
                {
                  label: t(locale, "Paid to date"),
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
              <p className="font-mono text-xs text-muted-foreground">
                {item.hint as string}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      {/*
        Credit sits directly under the headline, above the cargo.

        The question asked on the phone is "can they take this unpaid", and the
        answer is AVAILABLE — the limit less everything they already owe. It is
        not the Outstanding cell above, which is every bill they hold on any
        terms, and neither figure is cash: a credit sale is revenue that
        happened and money that has not arrived.
      */}
      {creditProfile ? (
        <CustomerCreditPanel
          customerId={customer.id}
          position={creditProfile.credit}
          rows={creditProfile.rows}
          lastPayment={creditOutcomes?.lastPayment ?? null}
          performance={creditProfile.performance}
          waivedUsd={creditOutcomes?.waivedUsd ?? 0}
          note={creditProfile.customer.creditNote}
          setAt={creditProfile.customer.creditApprovedAt}
          setBy={creditProfile.customer.creditApprovedBy?.name ?? null}
          rate={profileRate}
          /* Setting a standing facility is the money side's, never Support's —
             they read this panel with a customer on the line and ask Finance. */
          canSetLimit={can(user.role, "credit.limit")}
          canCollect={mayCollect}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Shipments */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">{t(locale, "Cargo")}</h2>
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
                          {cargoText(locale, shipment, "description")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatWeight(shipment.weightKg)} · {shipment.packages}{" "}
                          {t(locale, "pkg")}
                          {shipment.batch ? ` · ${shipment.batch.batchNumber}` : ""}
                        </p>
                      </div>
                      <ShipmentStatusBadge status={shipment.status} />
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(locale, "Registered")} {formatDate(shipment.registeredAt, locale)}
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
                                  ? `${formatUsd(outstanding)} ${t(locale, "owed")}`
                                  : t(locale, "paid")}
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
                                /* The action the phone card exists for, at a
                                   thumb's height rather than the 28px pill it
                                   inherited from the desk table. */
                                className="focus-ring inline-flex min-h-[44px] items-center rounded-full bg-brand px-4 text-xs font-semibold text-brand-foreground"
                              >
                                {t(locale, "Record payment")}
                              </Link>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t(locale, "not billed")}
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
                    <th className="p-3 font-medium">{t(locale, "Tracking")}</th>
                    <th className="p-3 font-medium">{t(locale, "Cargo")}</th>
                    <th className="hidden p-3 font-medium md:table-cell">
                      {t(locale, "Status")}
                    </th>
                    {showMoney ? (
                      <th className="p-3 font-medium">{t(locale, "Invoice")}</th>
                    ) : null}
                    <th className="hidden p-3 font-medium lg:table-cell">
                      {t(locale, "Registered")}
                    </th>
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
                            <div className="text-xs text-muted-foreground">
                              {shipment.batch.batchNumber}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <div className="max-w-[14rem] truncate">
                            {cargoText(locale, shipment, "description")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatWeight(shipment.weightKg)} · {shipment.packages}{" "}
                            {t(locale, "pkg")}
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
                                    ? `${formatUsd(outstanding)} ${t(locale, "owed")}`
                                    : t(locale, "paid")}
                                </div>
                                {!shipment.invoice.sentAt ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 border-warning/40 text-xs text-warning"
                                  >
                                    {t(locale, "never sent")}
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
                                    className="focus-ring mt-1.5 inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                                  >
                                    {t(locale, "Record payment")}
                                  </Link>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t(locale, "not billed")}
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                          {formatDate(shipment.registeredAt, locale)}
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
                        {t(locale, "No cargo yet.")}
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
              <h2 className="font-semibold">{t(locale, "Contact history")}</h2>
              <p className="text-sm text-muted-foreground">
                {t(locale, "Everything we have told this customer, and when.")}
              </p>
            </header>
            <ul className="divide-y">
              {customer.messages.map((message) => (
                <li key={message.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t(locale, MESSAGE_KIND_LABELS[message.kind] ?? message.kind)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t(locale, CHANNEL_LABELS[message.channel] ?? message.channel)} ·{" "}
                      {formatDateTime(message.sentAt, locale)}
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
                  {t(locale, "We have not contacted this customer through the system yet.")}
                </li>
              ) : null}
            </ul>
          </section>

          {/* Pickups, tickets, requests */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="rounded-xl border bg-card shadow-soft">
              <header className="border-b p-4">
                <h2 className="font-semibold">{t(locale, "Pickup history")}</h2>
              </header>
              <ul className="divide-y">
                {customer.pickupNotes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-mono text-xs">{note.noteNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {note.shipment.trackingNumber} · {formatDate(note.issuedAt, locale)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {t(locale, note.status.toLowerCase())}
                    </Badge>
                  </li>
                ))}
                {customer.pickupNotes.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    {t(locale, "Nothing collected yet.")}
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border bg-card shadow-soft">
              <header className="border-b p-4">
                <h2 className="font-semibold">{t(locale, "Tickets & requests")}</h2>
              </header>
              <ul className="divide-y">
                {customer.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/app/support/tickets/${ticket.id}`}
                      className="block p-3 transition-colors hover:bg-accent/40"
                    >
                      <p className="truncate text-sm">{ticket.subject}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {ticket.ticketNumber} ·{" "}
                        {t(locale, ticket.status.toLowerCase())}
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
                      <p className="font-mono text-xs text-muted-foreground">
                        {request.requestNumber} ·{" "}
                        {t(locale, request.status.toLowerCase())}
                      </p>
                    </Link>
                  </li>
                ))}
                {customer.tickets.length === 0 && customer.requests.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    {t(locale, "Nothing open.")}
                  </li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">{t(locale, "Details")}</h2>
            <dl className="space-y-3 text-sm">
              {[
                { label: t(locale, "Customer ID"), value: customer.code },
                {
                  label: t(locale, "Phone"),
                  value: customer.phone ?? t(locale, "Not on file"),
                },
                { label: t(locale, "Other phone"), value: customer.altPhone ?? "—" },
                { label: t(locale, "Email"), value: customer.email ?? "—" },
                { label: t(locale, "City"), value: customer.city ?? "—" },
                { label: t(locale, "Address"), value: customer.address ?? "—" },
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
              <h2 className="mb-1 font-semibold">{t(locale, "Contact this customer")}</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {t(
                  locale,
                  "Pick the message, edit it, send it from your WhatsApp, then record it here."
                )}
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

          <CustomerMergePanel
            keepId={customer.id}
            keepName={customer.name}
            candidates={mergeCandidates}
          />

          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">{t(locale, "Notes")}</h2>
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
