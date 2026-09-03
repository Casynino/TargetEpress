import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, MessageCircle, ReceiptText, Search, Users, Wallet } from "lucide-react";

import { CustomerPaymentForm, type OpenBill } from "@/components/app/customer-payment-form";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { activeAccounts } from "@/lib/accounts";
import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { IconHint } from "@/components/app/icon-hint";
import { t } from "@/lib/i18n";
import { severalBillsReminderSwahili, whatsappLink } from "@/lib/messages";
import { formatShillingTotal, formatUsd } from "@/lib/money";
import {
  rowInShillings,
  sumShillings,
  sumUsd,
  type MoneyRow,
} from "@/lib/money-totals";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Record a payment") };
}

/**
 * One transfer against several of a customer's bills.
 *
 * The counter already settles a single consignment from its own cargo page, and
 * that stays exactly where it is — it is the right screen when a customer is
 * standing in front of one box. This is the other case, which had no screen at
 * all: a customer with three unpaid consignments sends one M-Pesa transfer for
 * all three, and recording that as three payments produces three receipts and
 * three account movements for a deposit the bank shows once.
 *
 * A customer first, because a payment belongs to a person before it belongs to a
 * bill, and because the question the clerk is answering is "what does this
 * cover" — which cannot be asked until you know whose money it is.
 */
export default async function RecordCustomerPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; q?: string }>;
}) {
  /*
    Support opens this screen too.

    They cannot record — the form below submits their claim for Finance to
    verify — but the act of ticking a customer's several bills is the same act,
    and a second screen for it would be two places where the same mistake can
    be made in two different ways. The business rule does not move: nothing
    reaches an account until Finance agrees it did.
  */
  const viewer = await requirePermission("payment.submit");
  const canRecord = can(viewer.role, "payment.record");
  const locale = await viewerLocale();
  const params = await searchParams;

  const accounts = await activeAccounts();

  /* No customer chosen yet: find one. Searched by the three things a clerk has
     in front of them — the name on the message, the number it came from, and
     the tracking number the customer quoted. */
  if (!params.customer) {
    const q = (params.q ?? "").trim();

    /*
      WITHOUT A SEARCH, SHOW THE PEOPLE THIS SCREEN IS FOR.

      An empty box asking for a name is the wrong first thing on a page whose
      whole purpose is the customer with more than one unpaid consignment.
      Finance knows that customer exists; what they do not know is which. So the
      page answers that before it is asked, most bills first, and the search
      stays for the day somebody is chasing one particular name.
    */
    /* Selected once and reused for both lists, so the same customer never
       reads as two different amounts depending on how they were found. */
    const pick = Prisma.validator<Prisma.CustomerSelect>()({
      id: true,
      name: true,
      phone: true,
      code: true,
      invoices: {
        where: { status: { in: [...BILLED_INVOICE_STATUSES] } },
        select: {
          currency: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          /* Named in the reminder, so the customer can tell which boxes the
             figure is for — a total with no tracking numbers beside it is a
             demand they cannot check. */
          shipment: {
            select: {
              trackingNumber: true,
              description: true,
              descriptionEn: true,
              descriptionZh: true,
            },
          },
        },
      },
    });

    const withSeveral = q
      ? []
      : await prisma.customer.findMany({
          where: {
            invoices: { some: { status: { in: [...BILLED_INVOICE_STATUSES] } } },
          },
          take: 200,
          orderBy: { name: "asc" },
          select: pick,
        });

    const found = q
      ? await prisma.customer.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { phones: { some: { phone: { contains: q } } } },
              { code: { contains: q, mode: "insensitive" } },
              {
                shipments: {
                  some: { trackingNumber: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          },
          take: 40,
          orderBy: { name: "asc" },
          select: pick,
        })
      : withSeveral;

    /*
      WHAT THEY OWE, NOT JUST HOW MANY BILLS.

      "2 open bills" does not tell a clerk holding a TSh 300,000 transfer
      whether they are looking at the right person. The figure does, so it is
      read before the name is.

      Totalled per invoice rather than per customer: a bill written in
      shillings is already shillings and must not make the round trip through
      the dollar snapshot, which is how sixty thousand became 59,994.
    */
    const rate = await currentRateValue();
    const matches = found
      .map((customer) => {
        /* A bill that has been paid is not a bill this screen is waiting on,
           whatever its status still says: PAID stays on the record, and a
           customer whose two consignments are both settled was being listed
           here owing nothing. Half a cent of tolerance, because a converted
           settlement can land a fraction under its own total. */
        const open = customer.invoices.filter(
          (invoice) =>
            toNumber(invoice.total) - toNumber(invoice.amountPaid) > 0.005
        );
        const rows: MoneyRow[] = open.map((invoice) => {
          const outstanding =
            toNumber(invoice.total) - toNumber(invoice.amountPaid);
          const invoiceRate = toNumber(invoice.exchangeRate);
          return {
            currency: invoice.currency,
            amount: outstanding,
            /* A shilling bill carries its own frozen rate — the one the
               customer was quoted — and that is the honest dollar figure for
               it, not today's. */
            amountUsd:
              invoice.currency === "TZS"
                ? invoiceRate
                  ? outstanding / invoiceRate
                  : 0
                : outstanding,
          };
        });
        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          code: customer.code,
          bills: open.length,
          shillings: sumShillings(rows, rate),
          usd: sumUsd(rows, rate),
          /* Each consignment as the customer will read it on WhatsApp, in the
             money they will hand over — the same per-row conversion as the
             total above, so the lines add up to the figure under them. */
          lines: open.map((invoice, index) => ({
            trackingNumber: invoice.shipment.trackingNumber,
            description: cargoText(locale, invoice.shipment, "description"),
            amount: formatShillingTotal(
              rowInShillings(rows[index], rate),
              toNumber(rows[index].amountUsd),
              rate
            ),
          })),
        };
      })
      /* Only those with more than one still owing. A customer with a single
         bill is settled from their own cargo page, and listing them here would
         bury the handful this screen exists for. A search is a deliberate act,
         so it answers with whoever it found. */
      .filter((customer) => (q ? customer.bills > 0 : customer.bills > 1))
      /* Most owed first. The customer at the top of this list is the one
         whose money the business is most waiting on. */
      .sort((a, b) => b.shillings - a.shillings || b.bills - a.bills);

    /* Both totals carried, not one derived from the other — see
       formatShillingTotal for why the round trip is not free. */
    const owed = matches.reduce(
      (sum, row) => ({
        shillings: sum.shillings + row.shillings,
        usd: sum.usd + row.usd,
        bills: sum.bills + row.bills,
      }),
      { shillings: 0, usd: 0, bills: 0 }
    );

    return (
      <div className="space-y-6">
        <PageHeader
          title={t(locale, "Record a payment")}
          description={t(
            locale,
            "Customers with more than one unpaid consignment. Pick one and tick what they are paying for."
          )}
        />

        {/*
          THE SIZE OF THE MORNING, BEFORE THE LIST OF IT.

          Three figures a clerk would otherwise get by scrolling and adding up:
          how many people owe, how many bills that is, and what it comes to.
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
              <Users className="h-3.5 w-3.5" />
              {t(locale, "Waiting to pay")}
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">
              {matches.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(locale, "customers with more than one open bill")}
            </p>
          </div>

          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning">
              <ReceiptText className="h-3.5 w-3.5" />
              {t(locale, "Open bills")}
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">
              {owed.bills}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(locale, "consignments still to be settled")}
            </p>
          </div>

          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive">
              <Wallet className="h-3.5 w-3.5" />
              {t(locale, "Outstanding")}
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">
              {formatShillingTotal(owed.shillings, owed.usd, rate)}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatUsd(owed.usd)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-soft">
          <div className="border-b p-5">
            <SearchBox
              placeholder={t(locale, "Customer name, phone or tracking number")}
              defaultValue={q}
              suggestions={[]}
            />
          </div>

          {matches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">{t(locale, "Customer")}</th>
                    <th className="hidden p-3 font-medium sm:table-cell">
                      {t(locale, "Open bills")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t(locale, "Owed")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t(locale, "Reach them")}
                    </th>
                  </tr>
                </thead>
                {/*
                  POSSIBLY THE SAME PERSON.

                  Cargo registration matches on a normalised phone number, so
                  two records only survive when one of them has no phone —
                  which is how "Dickson Ndomba" and "dickson ndomba" became two
                  customers with a bill each. Flagged, never merged from here:
                  the desk knows things the database does not. Merging lives on
                  the customer's own page, behind its own permission.
                */}
                <tbody>
                  {matches.map((customer) => {
                    const twin = matches.some(
                      (other) =>
                        other.id !== customer.id &&
                        (other.name.trim().toLowerCase() ===
                          customer.name.trim().toLowerCase() ||
                          (other.phone !== null &&
                            other.phone === customer.phone))
                    );
                    const initials = customer.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase() ?? "")
                      .join("");
                    const href = `/app/finance/payments/new?customer=${customer.id}`;
                    return (
                      <tr key={customer.id} className="border-t">
                        <td className="p-3">
                          <Link
                            href={href}
                            className="focus-ring flex items-center gap-3"
                          >
                            <span
                              aria-hidden
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
                            >
                              {initials}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {customer.name}
                              </span>
                              <span className="block truncate font-mono text-xs text-muted-foreground">
                                {customer.code}
                                {customer.phone ? ` · ${customer.phone}` : ""}
                              </span>
                              {twin ? (
                                <span className="mt-1 inline-block rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                                  {t(
                                    locale,
                                    "Possibly the same customer as another below — check the phone before recording"
                                  )}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </td>

                        <td className="hidden p-3 sm:table-cell">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            <ReceiptText className="h-3.5 w-3.5" />
                            {customer.bills}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          <span className="block font-display font-bold tabular-nums">
                            {formatShillingTotal(
                              customer.shillings,
                              customer.usd,
                              rate
                            )}
                          </span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {formatUsd(customer.usd)}
                          </span>
                        </td>

                        <td className="p-3">
                          {/* Same three colours the call list uses, so a hand
                              that has learned one screen has learned both:
                              green message, blue money. */}
                          <div className="flex items-center justify-end gap-1.5">
                            {customer.phone ? (
                              <IconHint
                                label={t(locale, "Remind them on WhatsApp")}
                              >
                                <a
                                  href={whatsappLink(
                                    customer.phone,
                                    severalBillsReminderSwahili({
                                      customerName: customer.name,
                                      lines: customer.lines,
                                      total: formatShillingTotal(
                                        customer.shillings,
                                        customer.usd,
                                        rate
                                      ),
                                      totalUsd: formatUsd(customer.usd),
                                    })
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`WhatsApp ${customer.name}`}
                                  className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-success/40 text-success transition-colors hover:bg-success/10"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </IconHint>
                            ) : null}

                            <IconHint label={t(locale, "Record a payment")}>
                              <Link
                                href={href}
                                aria-label={`${t(locale, "Record a payment")} — ${customer.name}`}
                                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-brand/40 text-brand transition-colors hover:bg-brand/10"
                              >
                                <Banknote className="h-4 w-4" />
                              </Link>
                            </IconHint>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {q && matches.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {t(locale, "Nobody matched that.")}
            </p>
          ) : null}
          {!q && matches.length === 0 ? (
            <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              {t(
                locale,
                "Nobody has more than one unpaid consignment right now. Search for a customer to take a payment or hold a deposit."
              )}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: params.customer },
    select: {
      id: true,
      name: true,
      invoices: {
        where: { status: { in: [...BILLED_INVOICE_STATUSES] } },
        orderBy: { issuedAt: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          currency: true,
          /* The rate this bill was quoted at. A customer paying in shillings
             for a dollar bill converts at this and never at today's. */
          exchangeRate: true,
          total: true,
          amountPaid: true,
          shipment: {
            select: {
              trackingNumber: true,
              description: true,
              descriptionEn: true,
              descriptionZh: true,
              /* Which flight it came on. A customer's consignments arrive on
                 different aircraft weeks apart, and the clerk taking one
                 payment for all of them is asked which is which. */
              batch: { select: { batchNumber: true } },
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return (
      <div className="w-full">
        <PageHeader title={t(locale, "Record a payment")} />
        <p className="panel p-5 text-sm">{t(locale, "That customer no longer exists.")}</p>
      </div>
    );
  }

  /* Settled bills are dropped here rather than shown greyed out: this screen is
     a decision about money that is in somebody's hand right now, and a list of
     bills that need nothing is noise in front of it. */
  const bills: OpenBill[] = customer.invoices
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      trackingNumber: invoice.shipment.trackingNumber,
      description: cargoText(locale, invoice.shipment, "description"),
      batchNumber: invoice.shipment.batch?.batchNumber ?? null,
      currency: invoice.currency,
      exchangeRate:
        invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate),
      outstanding: toNumber(invoice.total) - toNumber(invoice.amountPaid),
    }))
    .filter((bill) => bill.outstanding > 0.005);

  return (
    <div className="w-full">
      <PageHeader
        title={customer.name}
        description={t(
          locale,
          "One payment, against as many of their bills as it covers. The account moves once."
        )}
        backTo={{
          href: "/app/finance/payments/new",
          label: t(locale, "Another customer"),
        }}
      />
      <CustomerPaymentForm
        canRecord={canRecord}
        customerId={customer.id}
        customerName={customer.name}
        bills={bills}
        accounts={accounts}
      />
    </div>
  );
}
