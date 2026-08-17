import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Package, Receipt, User } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { RecordCollectionForm } from "@/components/app/record-collection-form";
import { formatMoney, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Record a payment") };
}

/**
 * Completing one collection.
 *
 * Everything on this screen except the reference and the attachment is already
 * in the system, so none of it is asked for again — the desk checks it is the
 * right customer and gets on with the two things only they have.
 */
export default async function RecordCollectionPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const user = await requirePermission("payment.submit");
  const locale = await viewerLocale();
  const { invoiceId } = await params;

  const [invoice, rateRow] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        amountPaid: true,
        currency: true,
        storageCharge: true,
        storageWaivedUsd: true,
        customer: { select: { id: true, name: true, phone: true } },
        shipment: {
          select: { trackingNumber: true, ...selectText("description") },
        },
        submissions: {
          where: { status: "PENDING" },
          select: { submissionNumber: true },
          take: 1,
        },
      },
    }),
    currentRate(),
  ]);
  if (!invoice) notFound();

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  /* The one question asked at the counter that this screen could not answer:
     "why is my total more than the price I was quoted?" Storage is the usual
     answer, and it was invisible here — the person taking the money had to
     open the invoice in another tab to find out. */
  const storageCharged = toNumber(invoice.storageCharge);
  const storageWaived = toNumber(invoice.storageWaivedUsd);
  const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);
  const pending = invoice.submissions[0];

  return (
    <>
      <Link
        href="/app/collections/follow-up"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "Awaiting payment")}
      </Link>

      <PageHeader
        title="Record a customer payment"
        description="What the customer says they sent, with their proof. Finance checks it before anything is settled."
      />
      {/*
        The finance tab row stays put.

        Collections is a tab of Finance AND a workspace of its own, so opening
        it used to swap the whole tab row out — and getting back to the ledger
        or the overview meant going down to the sidebar. The owner called that
        inconvenient and he is right: a tab that removes its own tab bar leaves
        the reader with nowhere to go but back.

        Two rows, but hierarchical rather than identical: where you are in
        Finance, then where you are inside Collections. Only shown to a reader
        who has the finance tabs at all — Support shares this workspace and
        must not be given doors it cannot open.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceNav tabs={financeTabs(user.role)} />
      ) : null}

      <CollectionsNav canVerify={can(user.role, "payment.verify")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
        <section className="panel p-6">
          {invoice.status === "DRAFT" ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
              {invoice.invoiceNumber}{" "}
              {t(
                locale,
                "is still a draft. Finance has to confirm the price before anything can be collected against it — there is no figure here the business has agreed to yet."
              )}
            </p>
          ) : invoice.status === "PAID" ? (
            <p className="rounded-lg border border-success/40 bg-success/5 p-4 text-sm text-success">
              {invoice.invoiceNumber}{" "}
              {t(locale, "is settled in full. Nothing left to collect.")}
            </p>
          ) : pending ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
              {pending.submissionNumber}{" "}
              {t(
                locale,
                "is already with Finance for this bill. Wait for it to be checked rather than sending a second claim — two submissions against one invoice is the same money verified twice."
              )}
            </p>
          ) : (
            <RecordCollectionForm
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              customerName={invoice.customer.name}
              trackingNumber={invoice.shipment.trackingNumber}
              goods={cargoText(locale, invoice.shipment, "description")}
              outstanding={outstanding}
              currency={invoice.currency}
              rate={rate}
            />
          )}
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <User className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Customer")}
            </h2>
            <p className="mt-3 text-sm font-medium">
              <Link
                href={`/app/customers/${invoice.customer.id}`}
                className="hover:text-brand"
              >
                {invoice.customer.name}
              </Link>
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {invoice.customer.phone}
            </p>

            <h2 className="mt-5 flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Cargo")}
            </h2>
            <p className="mt-3 font-mono text-sm">
              <Link
                href={`/app/cargo/${invoice.shipment.trackingNumber}`}
                className="hover:text-brand"
              >
                {invoice.shipment.trackingNumber}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              {cargoText(locale, invoice.shipment, "description")}
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              {t(locale, "The bill")}
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, "Invoice")}</dt>
                <dd className="font-mono text-xs">{invoice.invoiceNumber}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, "Total")}</dt>
                <dd className="font-mono tabular-nums">
                  {formatMoney(toNumber(invoice.total), invoice.currency)}
                </dd>
              </div>
              {storageCharged > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "of which warehouse storage")}
                  </dt>
                  <dd className="font-mono text-xs tabular-nums text-destructive">
                    {formatMoney(storageCharged, invoice.currency)}
                  </dd>
                </div>
              ) : storageWaived > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "storage waived")}
                  </dt>
                  <dd className="font-mono text-xs tabular-nums text-warning">
                    {formatMoney(storageWaived, invoice.currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t(locale, "Paid so far")}
                </dt>
                <dd className="font-mono tabular-nums">
                  {formatMoney(toNumber(invoice.amountPaid), invoice.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                <dt className="font-medium">{t(locale, "Still owing")}</dt>
                <dd className="font-mono font-semibold tabular-nums text-warning">
                  {formatMoney(outstanding, invoice.currency)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
