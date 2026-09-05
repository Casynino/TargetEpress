import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * "SOMEBODY HAS ALREADY PAID FOR THIS — IT JUST HAS NOT BEEN AGREED YET."
 *
 * Support takes a customer's proof at the counter and sends it up. Nothing has
 * moved: no Payment exists, no ledger line, and the bill still owes every
 * shilling of it. So every list in this app goes on saying "Awaiting payment",
 * which is true of the books and false of the conversation — the customer paid
 * on Tuesday and is being rung on Thursday to ask why they have not.
 *
 * Worse, the desk that rings them can take the money again. The two write
 * paths refuse it, but only at the last step, after the counter has already
 * told a customer to pay twice.
 *
 * This is the one question every one of those screens needs to ask: for these
 * bills, is there a claim already waiting on Finance? Asked in one place so a
 * new list cannot forget to ask it, and so the answer is the same wherever it
 * is asked.
 *
 * A MERGED CLAIM COUNTS FOR EVERY BILL IT COVERS. One transfer against four
 * consignments is one submission with four allocation rows, and each of those
 * four consignments must show it — otherwise three of them look unclaimed and
 * the fourth does not, which is the same bug wearing a different hat.
 */

export type Claim = {
  id: string;
  submissionNumber: string;
  amount: number;
  currency: string;
  method: string;
  /** The delivery half of the claim, when the customer paid the cargo and the
      transport in one transfer. Zero on almost every claim — and the reason a
      claimed figure can legitimately exceed the bill. */
  transport: number;
  reference: string | null;
  submittedAt: Date;
  submittedByName: string | null;
  /** Which account the desk says it landed in. Null on claims raised before
      naming one was compulsory — say so rather than leaving a gap. */
  accountName: string | null;
  /** Every consignment this one claim answers, so a merge names them all. */
  covers: { invoiceId: string; invoiceNumber: string; trackingNumber: string | null }[];
};

/** Only PENDING. A verified claim has become a Payment and is money; a
    rejected or withdrawn one is not waiting on anybody. */
const PENDING = { status: "PENDING" as const };

/**
 * THE CONDITION EVERY DUPLICATE GUARD HAS TO ASK.
 *
 * "Is there a claim waiting on Finance that covers THIS bill" — where covering
 * it means either being raised against it, or being one line of a merged claim
 * that includes it.
 *
 * Every guard in the app asked only the first half. So one transfer claimed
 * across four consignments protected the consignment it happened to be
 * anchored to, and left the other three looking untouched: the counter could
 * take the money again on any of them, and the second claim would be accepted
 * because nothing had been raised against that particular bill. The merge
 * feature made the hole and nothing closed it.
 *
 * Written once, used by the four actions that must refuse and by the screens
 * that must warn, so the two can never disagree about what "already claimed"
 * means.
 */
export function pendingClaimWhere(invoiceId: string) {
  return {
    ...PENDING,
    OR: [
      { invoiceId },
      { allocations: { some: { invoiceId } } },
    ],
  };
}

/**
 * Claims waiting on Finance for the given bills, keyed by invoice id.
 *
 * An invoice appears in the map if it is either the submission's own invoice
 * or one of its allocations — the two ways a bill can be inside a claim.
 * Returns an empty map for an empty input without touching the database, so
 * callers can pass whatever their page happens to be showing.
 */
export async function claimsForInvoices(
  invoiceIds: string[]
): Promise<Map<string, Claim>> {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const submissions = await prisma.paymentSubmission.findMany({
    where: {
      ...PENDING,
      OR: [
        { invoiceId: { in: ids } },
        { allocations: { some: { invoiceId: { in: ids } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      submissionNumber: true,
      amount: true,
      currency: true,
      method: true,
      transportAmount: true,
      reference: true,
      createdAt: true,
      submittedBy: { select: { name: true } },
      account: { select: { name: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
      allocations: {
        select: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              shipment: { select: { trackingNumber: true } },
            },
          },
        },
      },
    },
  });

  const byInvoice = new Map<string, Claim>();
  for (const s of submissions) {
    /* The anchor bill and every allocated one. A single claim has no
       allocations and only its own invoice; a merged claim has both, and the
       anchor is usually also among the allocations — hence the de-duplication
       rather than a concatenation. */
    const covered = new Map<
      string,
      { invoiceId: string; invoiceNumber: string; trackingNumber: string | null }
    >();
    const add = (inv: {
      id: string;
      invoiceNumber: string;
      shipment: { trackingNumber: string } | null;
    } | null) => {
      if (!inv) return;
      covered.set(inv.id, {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        trackingNumber: inv.shipment?.trackingNumber ?? null,
      });
    };
    add(s.invoice);
    for (const a of s.allocations) add(a.invoice);

    const claim: Claim = {
      id: s.id,
      submissionNumber: s.submissionNumber,
      amount: toNumber(s.amount),
      currency: s.currency,
      method: s.method,
      transport: toNumber(s.transportAmount),
      reference: s.reference,
      submittedAt: s.createdAt,
      submittedByName: s.submittedBy?.name ?? null,
      accountName: s.account?.name ?? null,
      covers: [...covered.values()],
    };

    /* Newest first from the query, and the first one wins: a bill with two
       claims against it is already wrong, and the desk should be looking at
       the most recent. */
    for (const c of claim.covers) {
      if (!byInvoice.has(c.invoiceId)) byInvoice.set(c.invoiceId, claim);
    }
  }
  return byInvoice;
}

/** The same question for one bill. */
export async function claimForInvoice(
  invoiceId: string | null | undefined
): Promise<Claim | null> {
  if (!invoiceId) return null;
  return (await claimsForInvoices([invoiceId])).get(invoiceId) ?? null;
}
