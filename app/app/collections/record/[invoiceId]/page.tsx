import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Package, Receipt, User } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { PageHeader } from "@/components/app/page-header";
import { RecordCollectionForm } from "@/components/app/record-collection-form";
import { formatMoney, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Record a payment" };

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
  await requirePermission("payment.submit");
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
        customer: { select: { id: true, name: true, phone: true } },
        shipment: { select: { trackingNumber: true, description: true } },
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
  const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);
  const pending = invoice.submissions[0];

  return (
    <>
      <Link
        href="/app/collections/pending"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Awaiting payment
      </Link>

      <PageHeader
        title="Record a customer payment"
        description="What the customer says they sent, with their proof. Finance checks it before anything is settled."
      />

      <CollectionsNav />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel p-6">
          {invoice.status === "DRAFT" ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
              {invoice.invoiceNumber} is still a draft. Finance has to confirm
              the price before anything can be collected against it — there is
              no figure here the business has agreed to yet.
            </p>
          ) : invoice.status === "PAID" ? (
            <p className="rounded-lg border border-success/40 bg-success/5 p-4 text-sm text-success">
              {invoice.invoiceNumber} is settled in full. Nothing left to
              collect.
            </p>
          ) : pending ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
              {pending.submissionNumber} is already with Finance for this bill.
              Wait for it to be checked rather than sending a second claim —
              two submissions against one invoice is the same money verified
              twice.
            </p>
          ) : (
            <RecordCollectionForm
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              customerName={invoice.customer.name}
              trackingNumber={invoice.shipment.trackingNumber}
              goods={invoice.shipment.description}
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
              Customer
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
              Cargo
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
              {invoice.shipment.description}
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              The bill
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Invoice</dt>
                <dd className="font-mono text-xs">{invoice.invoiceNumber}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-mono tabular-nums">
                  {formatMoney(toNumber(invoice.total), invoice.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Paid so far</dt>
                <dd className="font-mono tabular-nums">
                  {formatMoney(toNumber(invoice.amountPaid), invoice.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                <dt className="font-medium">Still owing</dt>
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
