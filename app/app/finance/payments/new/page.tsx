import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Search, Users } from "lucide-react";

import { CustomerPaymentForm, type OpenBill } from "@/components/app/customer-payment-form";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { activeAccounts } from "@/lib/accounts";
import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillingTotal, formatUsd } from "@/lib/money";
import { sumShillings, sumUsd, type MoneyRow } from "@/lib/money-totals";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
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
  await requirePermission("payment.record");
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
        },
      },
    });

    const withSeveral = q
      ? []
      : await prisma.customer.findMany({
          where: {
            invoices: { some: { status: { in: [...BILLED_INVOICE_STATUSES] } } },
          },
          take: 40,
          orderBy: { name: "asc" },
          select: pick,
        });

    const found = q
      ? await prisma.customer.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { code: { contains: q, mode: "insensitive" } },
              {
                shipments: {
                  some: { trackingNumber: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          },
          take: 20,
          orderBy: { name: "asc" },
          select: pick,
        })
      : /* Only those with more than one — a customer with a single bill is
           settled from their own cargo page, and listing them here would bury
           the handful this screen exists for. */
        withSeveral.filter((customer) => customer.invoices.length > 1);

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
        const rows: MoneyRow[] = customer.invoices.map((invoice) => {
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
          bills: customer.invoices.length,
          shillings: sumShillings(rows, rate),
          usd: sumUsd(rows, rate),
        };
      })
      /* Most owed first. The customer at the top of this list is the one
         whose money the business is most waiting on. */
      .sort((a, b) => b.shillings - a.shillings || b.bills - a.bills);

    /* Both totals carried, not one derived from the other — see
       formatShillingTotal for why the round trip is not free. */
    const owed = matches.reduce(
      (sum, row) => ({
        shillings: sum.shillings + row.shillings,
        usd: sum.usd + row.usd,
      }),
      { shillings: 0, usd: 0 }
    );

    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title={t(locale, "Record a payment")}
          description={t(
            locale,
            "Customers with more than one unpaid consignment. Pick one and tick what they are paying for."
          )}
        />

        <div className="panel overflow-hidden">
          <div className="border-b p-5">
            <SearchBox
              placeholder={t(locale, "Customer name, phone or tracking number")}
              defaultValue={q}
              suggestions={[]}
            />
          </div>

          {/* What the list below adds up to, so the size of the morning is
              legible before anybody scrolls it. */}
          {matches.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t(locale, "{n} customer(s) waiting to pay").replace(
                  "{n}",
                  String(matches.length)
                )}
              </span>
              <span className="text-right">
                <span className="block text-sm font-semibold tabular-nums">
                  {formatShillingTotal(owed.shillings, owed.usd, rate)}
                </span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {formatUsd(owed.usd)}
                </span>
              </span>
            </div>
          ) : null}

          {/*
            POSSIBLY THE SAME PERSON.

            Cargo registration already matches on a normalised phone number, so
            two records only survive when one of them has no phone — which is
            exactly how "Dickson Ndomba" and "dickson ndomba" became two
            customers with a bill each. Flagged, never merged from here: the
            desk knows things the database does not, and quietly joining two
            people's money because their names match is a far worse mistake
            than showing two rows. Merging lives on the customer's own page,
            behind its own permission.
          */}
          <ul className="divide-y">
            {matches.map((customer) => {
              const twin = matches.some(
                (other) =>
                  other.id !== customer.id &&
                  (other.name.trim().toLowerCase() ===
                    customer.name.trim().toLowerCase() ||
                    (other.phone !== null && other.phone === customer.phone))
              );
              /* Two letters of the name, so a list of a dozen can be found by
                 shape before it is read. */
              const initials = customer.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("");
              return (
                <li key={customer.id}>
                  <Link
                    href={`/app/finance/payments/new?customer=${customer.id}`}
                    className="focus-ring flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand"
                    >
                      {initials}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {customer.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                        {customer.code}
                        {customer.phone ? ` · ${customer.phone}` : ""}
                      </span>
                      {twin ? (
                        <span className="mt-1.5 inline-block rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                          {t(
                            locale,
                            "Possibly the same customer as another below — check the phone before recording"
                          )}
                        </span>
                      ) : null}
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatShillingTotal(
                          customer.shillings,
                          customer.usd,
                          rate
                        )}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {formatUsd(customer.usd)}
                      </span>
                      <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t(locale, "{n} bills").replace(
                          "{n}",
                          String(customer.bills)
                        )}
                      </span>
                    </span>

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>

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
          total: true,
          amountPaid: true,
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
    },
  });

  if (!customer) {
    return (
      <div className="mx-auto w-full max-w-3xl">
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
      currency: invoice.currency,
      outstanding: toNumber(invoice.total) - toNumber(invoice.amountPaid),
    }))
    .filter((bill) => bill.outstanding > 0.005);

  return (
    <div className="mx-auto w-full max-w-3xl">
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
        customerId={customer.id}
        customerName={customer.name}
        bills={bills}
        accounts={accounts}
      />
    </div>
  );
}
