import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";

import { CustomerPaymentForm, type OpenBill } from "@/components/app/customer-payment-form";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { activeAccounts } from "@/lib/accounts";
import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
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
    const matches = q
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
          select: {
            id: true,
            name: true,
            phone: true,
            code: true,
            _count: {
              select: {
                invoices: { where: { status: { in: [...BILLED_INVOICE_STATUSES] } } },
              },
            },
          },
        })
      : [];

    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title={t(locale, "Record a payment")}
          description={t(
            locale,
            "One payment from one customer, against as many of their bills as it covers."
          )}
        />
        <div className="panel space-y-4 p-5">
          <SearchBox
            placeholder={t(locale, "Customer name, phone or tracking number")}
            defaultValue={q}
            suggestions={[]}
          />
          {q && matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(locale, "Nobody matched that.")}
            </p>
          ) : null}
          {/*
            POSSIBLY THE SAME PERSON.

            Cargo registration already matches on a normalised phone number, so
            two records only survive when one of them has no phone — which is
            exactly how "Dickson Ndomba" and "dickson ndomba" became two
            customers with a bill each. Flagged, never merged: the desk knows
            things the database does not, and quietly joining two people's money
            because their names match is a far worse mistake than showing two
            rows.
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
              return (
              <li key={customer.id}>
                <Link
                  href={`/app/finance/payments/new?customer=${customer.id}`}
                  className="focus-ring flex items-center justify-between gap-3 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {customer.name}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {customer.code}
                      {customer.phone ? ` · ${customer.phone}` : ""} ·{" "}
                      {customer._count.invoices} {t(locale, "open bill(s)")}
                    </span>
                    {twin ? (
                      <span className="mt-1 inline-block rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {t(locale, "Possibly the same customer as another below — check the phone before recording")}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
              );
            })}
          </ul>
          {!q ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              {t(locale, "Search for the customer whose money this is.")}
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
