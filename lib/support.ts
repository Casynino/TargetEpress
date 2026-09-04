import "server-only";

import type { Prisma } from "@prisma/client";

import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  storageDaysFor,
} from "@/lib/constants";
import { CREDIT_STATE_LABEL, dueLabel, type CreditState } from "@/lib/credit";
import {
  creditForCollections,
  type CreditAlert,
  type CreditRow,
} from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings, formatUsd } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

/**
 * What the support desk needs to know, computed rather than stored.
 *
 * The follow-up queue is the important thing here. "Who owes us money" is easy;
 * "who should I call next" is the actual job, and it needs the difference
 * between a customer who has never been sent a bill (send it) and one who was
 * sent it a week ago (chase it). Chasing someone who was never billed is how a
 * good customer gets annoyed, so the queue distinguishes them.
 *
 * It carries two kinds of debt now, and the difference between them is the whole
 * reason this file changed. A cash bill that is unpaid is late by default. A
 * credit is late only after a date the company itself granted, so a credit
 * inside its terms is not a chase at all — it is the arrangement working. Both
 * are in one queue because the desk works one queue, and every credit row says
 * out loud which of the two it is.
 */

export type FollowUpFilter =
  | "all"
  | "awaiting-payment"
  | "credit"
  | "overdue"
  | "due-today"
  | "due-week"
  | "part-paid"
  | "ready"
  | "storage"
  | "never-called"
  | "gone-quiet"
  | "with-finance"
  | "long-wait";

/**
 * Paid, or not paid — and, for a credit, paid LATE or not yet due.
 *
 * There used to be three more pills here — "Needs an invoice", "No invoice at
 * all", "Invoice not sent" — from when raising and sending a bill were separate
 * jobs somebody had to remember. Every invoice is generated automatically now,
 * so two of those read 0 forever and the third counted a step nobody performs.
 * Pills that are always empty teach people to stop reading the row.
 *
 * The five in the middle came in with credit (§14). "Overdue" is deliberately a
 * credit-only pill and says so in its hint: a cash bill has no agreed date to be
 * late against, and inventing one so the pill could count them would be this
 * app's oldest bug — a second definition of a deadline, disagreeing with the one
 * Finance granted.
 */
export const FOLLOW_UP_FILTERS: { key: FollowUpFilter; label: string; hint: string }[] = [
  { key: "all", label: "Everything", hint: "Every unpaid bill and every live credit" },
  { key: "awaiting-payment", label: "Cash outstanding", hint: "Billed on cash terms, still unpaid" },
  { key: "credit", label: "Credit outstanding", hint: "Released on terms and still owed" },
  { key: "overdue", label: "Overdue", hint: "Past the date the company granted" },
  { key: "due-today", label: "Due today", hint: "Last day inside terms" },
  { key: "due-week", label: "Due this week", hint: "Falling due within seven days" },
  { key: "part-paid", label: "Partly paid", hint: "Something came in, the rest did not" },
  { key: "ready", label: "Ready for pickup", hint: "Paid, waiting to be collected" },
  { key: "storage", label: "Overdue storage", hint: "Past the free storage window" },
  /*
    Four more, and they answer the question the money pills cannot: not "what
    is owed" but "who has nobody been talking to".

    A hundred and thirty-four rows all reading "Awaiting payment" is one
    undifferentiated list, and the desk was picking from the top of it. These
    split it by the desk's own work rather than by the bill's state.
  */
  { key: "never-called", label: "Never called", hint: "Nobody has contacted this customer yet" },
  { key: "gone-quiet", label: "Not called in a week", hint: "Last contacted more than seven days ago" },
  { key: "with-finance", label: "Paid, with Finance", hint: "The customer has paid and it is waiting to be checked" },
  { key: "long-wait", label: "Waiting over a week", hint: "Standing in Dar more than seven days" },
];

/** How the queue is ordered. The desk picks; the default is newest arrivals. */
export type FollowUpSort = "newest" | "waiting" | "owed" | "urgent";

export const FOLLOW_UP_SORTS: { key: FollowUpSort; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "waiting", label: "Waiting longest" },
  { key: "owed", label: "Most owed" },
  { key: "urgent", label: "Most urgent" },
];

/**
 * One comparator, so the page never sorts by hand.
 *
 * Newest leads because that is what the desk is actually asked about: a plane
 * lands, those customers ring, and the consignment that arrived this morning is
 * the conversation of the day. Urgency is still one click away and still what
 * ranks a credit that has gone past its date.
 */
export function sortFollowUp(rows: FollowUpRow[], sort: FollowUpSort) {
  const byArrival = (row: FollowUpRow) =>
    row.arrivedAt ? Date.parse(row.arrivedAt) : 0;
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "waiting":
        return b.daysInWarehouse - a.daysInWarehouse || byArrival(a) - byArrival(b);
      case "owed":
        return (b.outstanding ?? 0) - (a.outstanding ?? 0);
      case "urgent":
        return b.urgency - a.urgency || byArrival(b) - byArrival(a);
      case "newest":
      default:
        /* Ties broken by urgency rather than left to the database's order —
           a hundred consignments that landed on the same day would otherwise
           come back in whatever order Postgres felt like. */
        return byArrival(b) - byArrival(a) || b.urgency - a.urgency;
    }
  });
}

/**
 * What this row is owed under: an ordinary bill, or terms the company granted.
 *
 * A discriminator rather than a flag on the money, because the two are chased
 * differently, ranked differently and drawn differently — and a boolean called
 * `isCredit` on a row that also carries `outstanding` invites exactly the sum
 * this app must never make.
 */
export type FollowUpKind = "cash" | "credit";

/** The credit engine's answer about one receivable, carried, never recomputed. */
export type FollowUpCredit = {
  state: CreditState;
  /** The engine's own words: "Due in 3 days", "8 days overdue", "Due today". */
  dueText: string;
  /** What the state is called on screen, from the one label table. */
  stateLabel: string;
  dueDate: string | null;
  daysRemaining: number | null;
  daysOverdue: number;
  /** How long this debt has been standing, granted-to-now. */
  daysOnCredit: number;
  termDays: number | null;
  batchNumber: string | null;
};

/**
 * The rate line a customer reads, composed once.
 *
 * "USD 13.50/KG (Minimum 1 KG)". The minimum is stated only when one was
 * actually applied, and it is read off the chargeable weight rather than
 * assumed to be one kilo — minimums live on the pricing rule, and a rule with
 * a two-kilo minimum must not have a message telling the customer otherwise.
 * Per-item pricing has no weight minimum, so it says none.
 */
export function freightBasisOf(shipment: {
  quotedRate: Prisma.Decimal | null;
  quotedMethod: string | null;
  chargeableKg: Prisma.Decimal | null;
  quoteCurrency: string | null;
  weightKg: Prisma.Decimal | null;
}): string | null {
  if (shipment.quotedRate === null) return null;
  const currency = shipment.quoteCurrency ?? "USD";
  /* To the cent, always. formatMoney trims a trailing zero — right for a
     screen, wrong in a price quoted to a customer, where "USD 13.5/KG" reads
     as a figure somebody typed rather than one the system holds. */
  const rate = `${currency} ${toNumber(shipment.quotedRate).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  if (shipment.quotedMethod === "FIXED_PER_ITEM") return `${rate}/pcs`;

  const charged = shipment.chargeableKg === null ? null : toNumber(shipment.chargeableKg);
  const actual = shipment.weightKg === null ? null : toNumber(shipment.weightKg);
  const minimumApplied =
    charged !== null && actual !== null && charged > actual + 0.0005;

  return `${rate}/KG${minimumApplied ? ` (Minimum ${charged} KG)` : ""}`;
}

export type FollowUpRow = {
  /**
   * The row's identity on screen.
   *
   * Not the shipment id, which a credit row does not have: the cargo behind a
   * credit has usually been handed over, and the thing still outstanding is the
   * invoice. Keyed off whichever of the two this row IS.
   */
  id: string;
  /** Null on a credit — the debt is the invoice, not a box on the floor. */
  shipmentId: string | null;
  kind: FollowUpKind;
  /** Everything the credit engine derived. Null on a cash bill. */
  credit: FollowUpCredit | null;
  /** Null on a credit whose consignment has already left our floor. */
  trackingNumber: string | null;
  /**
   * Already in the language of whoever asked for the queue. Guangzhou types
   * "手机配件" and the Dar desk reading this row gets "Mobile phone
   * accessories" — resolved here so no screen has to remember to do it.
   */
  description: string;
  /** The same cargo, in English, for the message that leaves the building. */
  descriptionForCustomer: string;
  status: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  arrivedAt: string | null;
  daysInWarehouse: number;
  /** Off the cargo record, for the customer's message. */
  weightKg: number | null;
  /**
   * How the freight figure was reached, ready to print: "USD 13.50/KG
   * (Minimum 1 KG)". Composed where the quote is read rather than at each
   * screen, so no two messages state the same rate differently.
   */
  freightBasis: string | null;
  /** The rate frozen on this invoice, never today's published one. */
  exchangeRate: number | null;
  storageDays: number;
  /**
   * What the desk should quote — nothing at all once the fee is forgiven.
   *
   * This was re-derived from the two dates and never read the waiver, so a
   * consignment whose fee had been written off kept appearing in the queue with
   * a red charge against it, and the desk would ring the customer to chase
   * money the office had already given up. That is a worse call than no call.
   */
  storageCharge: number;
  /** Kept so the row can say "waived" rather than just going quiet. */
  storageWaivedUsd: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceNumber: string | null;
  total: number | null;
  /** What has come in against it — the half that makes "partly paid" a state. */
  paid: number | null;
  outstanding: number | null;
  /** What the BILL is priced in — the currency `outstanding` is stated in. */
  currency: string;
  /** What is already off it, so a discount box opens on the truth. */
  invoiceDiscount: number;
  localCurrency: string | null;
  outstandingLocal: number | null;
  invoiceSentAt: string | null;
  lastContactAt: string | null;
  lastContactKind: string | null;
  /** What the desk should do next, in one phrase. */
  nextAction: string;
  /** Sort weight — higher is more urgent. */
  urgency: number;
};

function daysBetween(from: Date, to = new Date()) {
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );
}

/**
 * Everything a customer still owes us, ranked: the cargo standing in Dar with a
 * bill against it, and the credit we released on terms.
 *
 * Deliberately not paginated at the database level for the filters, because the
 * desk needs accurate counts on every pill — a filter that says "3" when it
 * means "3 of the first 50" is worse than no number.
 *
 * `credit` is a parameter and not an assumption. Every desk that can open this
 * queue happens to hold credit.view today, so nothing changes on screen — but
 * the day one does not, the gate is written at the caller who knows the reader's
 * role rather than buried in a query that cannot see it.
 */
export async function followUpQueue({ credit = true }: { credit?: boolean } = {}) {
  // The cargo description follows the reader, not the person who typed it.
  const locale = await viewerLocale();
  const now = new Date();
  /*
    Fetched before the cash rows are built rather than merged after, because it
    decides which cash rows exist at all: a bill on live credit must not also
    appear as an unpaid cash bill. It appeared twice on the way here — once as
    "chase payment, billed 6 days ago" and once as a credit with a fortnight to
    run — and the first of those two is a phone call to a customer who is
    keeping to an arrangement the company gave them.
  */
  const { chase, notCash } = credit
    ? await creditForCollections(now)
    : { chase: [] as CreditRow[], notCash: [] as string[] };
  const onCredit = new Set(notCash);

  const shipments = await prisma.shipment.findMany({
    where: {
      status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
    },
    orderBy: { arrivedAt: "asc" },
    select: {
      id: true,
      trackingNumber: true,
      ...selectText("description"),
      status: true,
      arrivedAt: true,
      deliveredAt: true,
      // The customer must be told what their cargo weighs, and nobody at a
      // desk should be typing it.
      weightKg: true,
      /* And the rate it was charged at, for the same reason. The customer
         could see the amount but never the arithmetic between the weight and
         it, so the figure arrived as something to be taken on trust.
         chargeableKg is what a minimum was applied to, when one was. */
      quotedRate: true,
      quotedMethod: true,
      chargeableKg: true,
      quoteCurrency: true,
      customer: { select: { id: true, name: true, phone: true } },
      invoice: {
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          currency: true,
          discount: true,
          localCurrency: true,
          sentAt: true,
          confirmedAt: true,
          issuedAt: true,
          storageWaivedUsd: true,
          /* Money the customer has already handed over and Finance has not
             agreed to yet. Without it this list cannot tell a bill nobody has
             paid from one that is sitting in the verification queue, and rings
             the customer either way. */
          submissions: {
            where: { status: "PENDING" },
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: { submissionNumber: true, submittedAt: true },
          },
        },
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { sentAt: true, kind: true },
      },
    },
  });

  const cashRows: FollowUpRow[] = shipments.map((shipment) => {
    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    const invoice = shipment.invoice;
    const storageWaivedUsd = toNumber(invoice?.storageWaivedUsd ?? 0);
    const total = invoice ? toNumber(invoice.total) : null;
    const paid = invoice ? toNumber(invoice.amountPaid) : null;
    const outstanding =
      total === null || paid === null ? null : Math.max(0, total - paid);
    const rate = invoice?.exchangeRate ? toNumber(invoice.exchangeRate) : null;
    const lastMessage = shipment.messages[0] ?? null;

    let nextAction: string;
    let urgency: number;

    if (!invoice) {
      nextAction = "Raise the invoice";
      urgency = 60;
    } else if (invoice.status === "DRAFT") {
      // The system has priced it; nobody has signed the price off. Chasing a
      // customer for a figure Finance has not looked at is how a bill gets
      // argued about.
      nextAction = "Confirm the price";
      urgency = 65;
    } else if (outstanding !== null && outstanding <= 0) {
      nextAction =
        shipment.status === "READY_FOR_PICKUP"
          ? "Paid — tell them to collect"
          : "Paid — awaiting pickup note";
      urgency = 30;
    } else if (invoice.submissions.length > 0) {
      /*
        THE CUSTOMER HAS PAID. NOBODY HAS AGREED IT YET.

        The bill still reads as owing, because a claim is not money until
        Finance verifies it — and this list, which exists to decide who gets
        rung, could not tell the two apart. So the desk rang customers who had
        already sent their shillings and had the screenshot to prove it, which
        is the one call that costs you a customer rather than collecting from
        one.

        Urgency drops below every genuine debt on the list. There is nothing for
        Support to do here: the ball is with Finance, and saying so is the whole
        point of the row.
      */
      nextAction = "Waiting on Finance to verify";
      urgency = 20;
    } else {
      // Counted from when the bill became real, not from when somebody pressed
      // send. Invoices are generated automatically, so "sent" is a step nobody
      // performs — 81 rows read "Send the invoice" for a job that does not
      // exist, which is worse than no instruction at all.
      const daysBilled = daysBetween(invoice.confirmedAt ?? invoice.issuedAt);
      nextAction =
        daysBilled >= 3
          ? `Chase payment — billed ${daysBilled} days ago`
          : "Awaiting payment";
      urgency = 50 + Math.min(daysBilled * 3, 30);
    }

    /* Storage is money leaking away from a customer who has stopped paying
       attention, so it outranks everything else in the queue — unless the
       customer has already paid and it is Finance who has not looked yet.
       Ringing them about a storage fee they cannot stop is worse than not
       ringing at all, and it would put the row straight back to the top that
       the branch above just moved it off. */
    if (storageDays > 0 && (invoice?.submissions.length ?? 0) === 0) {
      urgency += 25 + Math.min(storageDays * 2, 40);
    }

    return {
      id: shipment.id,
      shipmentId: shipment.id,
      kind: "cash" as const,
      credit: null,
      trackingNumber: shipment.trackingNumber,
      description: cargoText(locale, shipment, "description"),
      /*
        THE CUSTOMER'S COPY, NEVER THE CLERK'S LANGUAGE.

        `description` above follows whoever is at the keyboard, which is right
        for the column they are reading. The WhatsApp message is not for them:
        it is Swahili, to a Tanzanian customer, and a Guangzhou desk chasing a
        payment must not send them 普通百货. English is the language this
        business writes to customers in when Swahili copy does not exist, so
        the message asks for English regardless of who is looking at the row.

        Falls back to whatever the desk originally typed when there is no
        English rendering at all — a Chinese description is still better than
        a blank line where the cargo should be.
      */
      descriptionForCustomer: cargoText("en", shipment, "description"),
      status: shipment.status,
      customerId: shipment.customer.id,
      customerName: shipment.customer.name,
      customerPhone: shipment.customer.phone,
      arrivedAt: shipment.arrivedAt?.toISOString() ?? null,
      daysInWarehouse: shipment.arrivedAt ? daysBetween(shipment.arrivedAt) : 0,
      weightKg: shipment.weightKg === null ? null : toNumber(shipment.weightKg),
      freightBasis: freightBasisOf(shipment),
      exchangeRate: rate,
      storageDays,
      storageCharge:
        storageWaivedUsd > 0 ? 0 : storageDays * STORAGE_POLICY.perDayUsd,
      storageWaivedUsd,
      invoiceId: invoice?.id ?? null,
      invoiceStatus: invoice?.status ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      total,
      paid,
      outstanding,
      currency: invoice?.currency ?? "USD",
      invoiceDiscount: invoice ? toNumber(invoice.discount) : 0,
      localCurrency: invoice?.localCurrency ?? null,
      outstandingLocal:
        rate === null || outstanding === null ? null : Math.round(outstanding * rate),
      invoiceSentAt: invoice?.sentAt?.toISOString() ?? null,
      lastContactAt: lastMessage?.sentAt.toISOString() ?? null,
      lastContactKind: lastMessage?.kind ?? null,
      nextAction,
      urgency,
    };
  });

  /*
    One list, two kinds of debt. The cash rows lose the ones now carried as
    credit — dropped here rather than in the query above, because "is this on
    live credit" is a derived state and the only thing entitled to decide it is
    the credit engine.
  */
  const rows: FollowUpRow[] = [
    ...cashRows.filter((row) => row.invoiceId === null || !onCredit.has(row.invoiceId)),
    ...chase.map(creditFollowUpRow),
  ];

  rows.sort((a, b) => b.urgency - a.urgency);
  return rows;
}

/**
 * One credit, as a row of the same queue.
 *
 * Every amount and every day count arrives already derived by the credit engine.
 * All this adds is the sentence and the weight, which is the one thing a call
 * list is for — and the vocabulary is honest about the distinction §14 turns on:
 * an overdue credit outranks everything else on the page, while a credit inside
 * its terms ranks below even a paid consignment waiting to be collected, and
 * says in words that there is nothing to chase. Ringing a customer who is
 * keeping to an arrangement the company granted is worse than not ringing.
 */
function creditFollowUpRow(r: CreditRow): FollowUpRow {
  const days = r.daysRemaining;
  let nextAction: string;
  let urgency: number;

  if (r.state === "OVERDUE") {
    /*
      Above every cash row on the page, including the oldest one bleeding
      storage — and the base is set high enough that it cannot be overtaken by
      one. An unpaid cash bill still has the cargo sitting on our own floor
      behind it; an overdue credit has nothing behind it at all, because the
      boxes went home on a date the company itself agreed to. That is the top of
      the call list by definition.
    */
    nextAction = "Overdue credit — call today";
    urgency = 150 + Math.min(r.daysOverdue * 3, 45);
  } else if (days === 0) {
    nextAction = "Falls due today — collect before close";
    urgency = 90;
  } else if (days === null) {
    /* Granted with no due date. Not a chase and not a debt anybody can be late
       on — a gap in the paperwork, and the fix is on the bill, not the phone. */
    nextAction = "Credit with no due date — set the terms";
    urgency = 55;
  } else if (days <= 7) {
    nextAction = "Inside terms — a reminder now saves the chase";
    urgency = 35 + Math.max(0, 8 - days);
  } else {
    nextAction = "Inside terms — nothing to chase";
    urgency = 20;
  }

  return {
    id: `credit:${r.invoiceId}`,
    shipmentId: null,
    kind: "credit",
    credit: {
      state: r.state,
      dueText: dueLabel(r),
      stateLabel: CREDIT_STATE_LABEL[r.state],
      dueDate: r.dueDate?.toISOString() ?? null,
      daysRemaining: r.daysRemaining,
      daysOverdue: r.daysOverdue,
      daysOnCredit: r.daysOutstanding,
      termDays: r.termDays,
      batchNumber: r.batchNumber,
    },
    trackingNumber: r.trackingNumber,
    /* Empty on purpose. The credit engine carries the money and the dates, not
       what is in the boxes, and a row that spends a line saying it does not know
       the cargo description teaches the reader to stop reading rows. */
    description: "",
    descriptionForCustomer: "",
    status: "ON_CREDIT",
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    arrivedAt: null,
    daysInWarehouse: 0,
    weightKg: null,
    /* The consignment behind a credit has usually gone, and the quote went
       with it — the bill is what is outstanding. */
    freightBasis: null,
    /* The bill's own frozen rate. A credit is quoted once and settled weeks
       later, so today's published rate would restate a figure the customer is
       holding on a printed invoice. */
    exchangeRate: r.exchangeRate,
    /* Zero, and not because it was forgiven: the cargo has gone, so the clock
       stopped. Whatever storage it ran up is already inside `total` below. */
    storageDays: 0,
    storageCharge: 0,
    storageWaivedUsd: r.storageWaivedUsd,
    invoiceId: r.invoiceId,
    invoiceStatus: null,
    invoiceNumber: r.invoiceNumber,
    total: r.totalUsd,
    paid: r.paidUsd,
    outstanding: r.outstandingUsd,
    currency: r.currency ?? "USD",
    /* A credit row's bill is not being re-priced from this list. */
    invoiceDiscount: 0,
    localCurrency: null,
    outstandingLocal:
      r.exchangeRate === null ? null : Math.round(r.outstandingUsd * r.exchangeRate),
    invoiceSentAt: null,
    lastContactAt: null,
    lastContactKind: null,
    nextAction,
    urgency,
  };
}

export function matchesFilter(row: FollowUpRow, filter: FollowUpFilter) {
  const owing = (row.outstanding ?? 0) > 0.005;
  switch (filter) {
    case "awaiting-payment":
      /* Cash only. This pill meant "anything unpaid", and with credit in the
         queue that read an arrangement the company granted as a late bill.
         Drafts stay out too: until Finance confirms the price, no one owes
         the figure — the row's action is "Confirm the price", not a chase. */
      return row.kind === "cash" && owing && row.invoiceStatus !== "DRAFT";
    case "credit":
      return row.kind === "credit";
    case "overdue":
      /* Credit only, deliberately. A cash bill has no agreed date to be late
         against, and inventing one here would be a second definition of a
         deadline disagreeing with the one Finance actually granted. */
      return (row.credit?.daysOverdue ?? 0) > 0;
    case "due-today":
      return row.credit?.daysRemaining === 0;
    case "due-week":
      return (
        row.credit !== null &&
        row.credit.daysRemaining !== null &&
        row.credit.daysRemaining >= 0 &&
        row.credit.daysRemaining <= 7
      );
    case "part-paid":
      // Both kinds: money that arrived and then stopped is the same problem
      // whether terms were granted or not.
      return (row.paid ?? 0) > 0.005 && owing;
    case "ready":
      return row.status === "READY_FOR_PICKUP";
    case "storage":
      return row.storageDays > 0;
    case "never-called":
      /* Nobody has rung or messaged this customer at all. The most answerable
         row on the page and the one with nothing on it to say so. */
      return row.lastContactAt === null;
    case "gone-quiet":
      return (
        row.lastContactAt !== null &&
        daysBetween(new Date(row.lastContactAt)) > 7
      );
    case "with-finance":
      /* Already paid as far as the customer is concerned. Ringing them is the
         wrong call — this pill exists so the desk can see them and skip them. */
      return row.nextAction === "Waiting on Finance to verify";
    case "long-wait":
      return row.daysInWarehouse > 7;
    case "all":
    default:
      return true;
  }
}

/**
 * The strip above the queue, from the rows the reader is actually looking at.
 *
 * One place because both screens that carry this queue print these figures, and
 * because the thing they must never do is add the first two together: cash
 * outstanding is a bill nobody paid, credit outstanding is money the company
 * agreed to wait for, and one merged "owed" total hides which of the two the
 * business is carrying. Nothing is derived here — this adds up figures the
 * engine already worked out.
 */
export function followUpTotals(rows: FollowUpRow[]) {
  const owed = (row: FollowUpRow) => row.outstanding ?? 0;
  const total = (
    pick: (row: FollowUpRow) => boolean,
    take: (row: FollowUpRow) => number = owed
  ) => Math.round(rows.filter(pick).reduce((n, row) => n + take(row), 0) * 100) / 100;

  const inWeek = (row: FollowUpRow) =>
    row.credit !== null &&
    row.credit.daysRemaining !== null &&
    row.credit.daysRemaining >= 0 &&
    row.credit.daysRemaining <= 7;

  return {
    count: rows.length,
    /* A draft's figure is the system's guess, not a confirmed demand — the
       same rule BILLED_INVOICE_STATUSES states — so "Cash owed" must not
       include money nobody has been asked for yet. */
    cashUsd: total(
      (row) => row.kind === "cash" && row.invoiceStatus !== "DRAFT"
    ),
    creditUsd: total((row) => row.kind === "credit"),
    overdueUsd: total((row) => (row.credit?.daysOverdue ?? 0) > 0),
    dueTodayUsd: total((row) => row.credit?.daysRemaining === 0),
    dueWeekUsd: total(inWeek),
    storageUsd: total(() => true, (row) => row.storageCharge),
    creditCount: rows.filter((row) => row.kind === "credit").length,
    /** Credits that are not a chase at all, so nobody counts them as one. */
    insideTermsCount: rows.filter(
      (row) => row.credit !== null && row.credit.daysOverdue === 0
    ).length,
  };
}

/** The shape the bounded attention panel takes. The component owns the type. */
export type CreditAttn = {
  id: string;
  group: string;
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  href: string;
  value?: string;
  valueSub?: string;
};

/**
 * §19's credit alerts as rows of the panel every desk already has.
 *
 * Written once and read by three desks — Support, Finance and the owner —
 * because three copies of five sentences drift apart, and two desks describing
 * one customer's limit differently is how the same decision gets made twice.
 * What differs between desks is what they can DO about a thing, so that is the
 * only parameter: an unanswered request is work to whoever approves credit and a
 * progress note to whoever asked for it.
 *
 * Rows, not a section. The standing rule about that panel is that it stays ONE
 * fixed-height filterable list and never a stack that grows a heading every time
 * the business acquires another kind of problem.
 */
export function creditAttention(
  alerts: CreditAlert[],
  view: { locale: Locale; rate: number | null; canApprove: boolean }
): CreditAttn[] {
  const { locale, rate, canApprove } = view;
  const group = t(locale, "Credit");
  /* The figure is baked into the label before any dictionary could see the
     sentence, so the phrase is looked up on its own and the number put back in
     front of it — the same trick the owner's panel and the desk pulse use, and
     the only way these reach a Chinese reader at all. */
  const count = (n: number, phrase: string) => `${n} ${t(locale, phrase)}`;
  const money = (usd: number) => formatShillings(usd, rate);
  /* The exact dollar figure, only where the line above it is a conversion: with
     no rate published formatShillings prints dollars itself, and the same amount
     twice reads as two currencies. */
  const inUsd = (usd: number) => (rate === null ? undefined : formatUsd(usd));
  const who = (alert: CreditAlert) => {
    const rest = alert.customerCount - alert.names.length;
    const named = alert.names.join(", ");
    return rest > 0 ? `${named} +${rest}` : named;
  };

  const rows: (CreditAttn | null)[] = alerts.map((alert) => {
    switch (alert.kind) {
      case "OVERDUE":
        return {
          id: "credit-overdue",
          group,
          severity: "critical",
          label: count(alert.count, "credit(s) overdue"),
          detail: `${t(locale, "Oldest is")} ${alert.worstDaysOverdue} ${t(
            locale,
            "days past the date we granted"
          )} · ${who(alert)}`,
          href: "/app/collections/follow-up?filter=overdue",
          value: money(alert.amountUsd),
          valueSub: inUsd(alert.amountUsd),
        };
      case "DUE_TODAY":
        return {
          id: "credit-due-today",
          group,
          severity: "warning",
          label: count(alert.count, "credit(s) due today"),
          detail: `${t(locale, "Last day inside terms")} · ${who(alert)}`,
          href: "/app/collections/follow-up?filter=due-today",
          value: money(alert.amountUsd),
          valueSub: inUsd(alert.amountUsd),
        };
      case "DUE_SOON":
        return {
          id: "credit-due-soon",
          group,
          severity: "info",
          label: count(alert.count, "credit(s) due this week"),
          detail: `${t(locale, "Inside terms, nothing to chase yet")} · ${who(alert)}`,
          href: "/app/collections/follow-up?filter=due-week",
          value: money(alert.amountUsd),
          valueSub: inUsd(alert.amountUsd),
        };
      /* The two limit rows carry their money inside the sentence rather than in
         the right-hand column. "3 customers over their credit limit" beside a
         bare amount reads as what they owe; what it actually is is how far past
         the line they are, and that only survives with the words attached. */
      case "LIMIT_EXCEEDED":
        return {
          id: "credit-limit-over",
          group,
          severity: "critical",
          label: count(alert.count, "customer(s) over their credit limit"),
          detail: `${t(locale, "Over by")} ${money(alert.amountUsd)} · ${who(alert)}`,
          href: "/app/finance/credit",
        };
      case "LIMIT_NEAR":
        return {
          id: "credit-limit-near",
          group,
          severity: "warning",
          label: count(alert.count, "customer(s) near their credit limit"),
          detail: `${money(alert.amountUsd)} ${t(
            locale,
            "of room left before the next release has to be refused"
          )} · ${who(alert)}`,
          href: "/app/finance/credit",
        };
      case "AWAITING_DECISION":
        return canApprove
          ? {
              id: "credit-requests",
              group,
              severity: "critical",
              label: count(alert.count, "credit request(s) waiting on you"),
              detail: `${t(
                locale,
                "The cargo does not move until you answer"
              )} · ${who(alert)}`,
              href: "/app/finance/credit",
              value: money(alert.amountUsd),
              valueSub: inUsd(alert.amountUsd),
            }
          : {
              id: "credit-requests",
              group,
              severity: "info",
              label: count(alert.count, "credit request(s) with Finance"),
              detail: t(
                locale,
                "Asked for and waiting on a decision. Nothing to do but watch."
              ),
              href: "/app/finance/credit",
              value: money(alert.amountUsd),
              valueSub: inUsd(alert.amountUsd),
            };
      default:
        return null;
    }
  });

  return rows.filter((row): row is CreditAttn => row !== null);
}

/** Headline numbers for the support dashboard. */
export async function supportOverview() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    openTickets,
    urgentTickets,
    ticketsToday,
    waitingOnUs,
    openRequests,
    requestsToday,
    customers,
    activeShipments,
    deliveredShipments,
    unpaidInvoices,
    unsentInvoices,
    readyForPickup,
    contactedToday,
  ] = await Promise.all([
    prisma.supportTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
    }),
    prisma.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        priority: { in: ["HIGH", "URGENT"] },
      },
    }),
    prisma.supportTicket.count({ where: { createdAt: { gte: startOfToday } } }),
    // "Customers waiting for responses" from the spec: ours to move, not theirs.
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.sourcingRequest.count({
      where: { status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
    }),
    prisma.sourcingRequest.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.customer.count(),
    prisma.shipment.count({
      where: {
        status: { in: ["READY_TO_DEPART", "IN_TRANSIT", "RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
      },
    }),
    prisma.shipment.count({ where: { status: "DELIVERED" } }),
    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _count: true,
      _sum: { total: true, amountPaid: true },
    }),
    // Drafts excluded: an invoice nobody has confirmed is not an invoice
    // somebody forgot to send.
    prisma.invoice.count({
      where: { sentAt: null, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    }),
    prisma.shipment.count({ where: { status: "READY_FOR_PICKUP" } }),
    prisma.customerMessage.count({ where: { sentAt: { gte: startOfToday } } }),
  ]);

  const outstanding =
    toNumber(unpaidInvoices._sum?.total ?? 0) -
    toNumber(unpaidInvoices._sum?.amountPaid ?? 0);

  return {
    openTickets,
    urgentTickets,
    ticketsToday,
    waitingOnUs,
    openRequests,
    requestsToday,
    customers,
    activeShipments,
    deliveredShipments,
    unpaidCount: unpaidInvoices._count,
    outstanding,
    unsentInvoices,
    readyForPickup,
    contactedToday,
  };
}

/**
 * The same Tanzanian number, written the ways people actually write it.
 *
 * Numbers are stored as +255…, but a customer calling in reads theirs off the
 * handset as 0757… — and a clerk types what they hear. Matching only the stored
 * form means the search fails on the single most common input, so every query
 * that could be a phone number is tried in both shapes.
 */
export function phoneVariants(query: string): string[] {
  const digits = query.replace(/[^\d]/g, "");
  if (digits.length < 6) return query.trim() ? [query.trim()] : [];

  const variants = new Set<string>([digits]);

  if (digits.startsWith("0")) {
    variants.add(`255${digits.slice(1)}`);
    variants.add(digits.slice(1));
  } else if (digits.startsWith("255")) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(digits.slice(3));
  } else {
    // A bare 7xxxxxxxx — the part that is the same in both forms.
    variants.add(`255${digits}`);
    variants.add(`0${digits}`);
  }

  return [...variants];
}

/**
 * Shipment search across every handle a caller might have.
 *
 * A customer on the phone rarely has a tracking number. They have their name,
 * or the number they called from, or "the batch that came last Tuesday" — so
 * all four are one search box, not four.
 */
export async function searchShipments(query: string, take = 40) {
  const q = query.trim();
  if (!q) return [];

  const where: Prisma.ShipmentWhereInput = {
    OR: [
      { trackingNumber: { contains: q, mode: "insensitive" } },
      { cartonRef: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      ...phoneVariants(q).map((phone) => ({ customer: { phone: { contains: phone } } })),
      { customer: { code: { contains: q, mode: "insensitive" } } },
      { batch: { batchNumber: { contains: q, mode: "insensitive" } } },
      { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
    ],
  };

  return prisma.shipment.findMany({
    where,
    orderBy: { registeredAt: "desc" },
    take,
    select: {
      id: true,
      trackingNumber: true,
      ...selectText("description"),
      status: true,
      weightKg: true,
      packages: true,
      origin: true,
      arrivedAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      batch: { select: { batchNumber: true } },
      invoice: {
        select: { invoiceNumber: true, total: true, amountPaid: true, sentAt: true },
      },
      // Unfinished cases only. A shipment can sit at RECEIVED_AT_DAR and still
      // be damaged — the shipment status says where the cargo is, never what
      // is wrong with it, so anyone looking a box up has to be told both.
      exceptions: {
        where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
        orderBy: { raisedAt: "desc" },
        select: { type: true },
      },
    },
  });
}

/** Everything the desk needs about one customer, in one call. */
export async function customerProfile(idOrCode: string) {
  const customer = await prisma.customer.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
    include: {
      shipments: {
        where: { deletedAt: null },
        orderBy: { registeredAt: "desc" },
        /* The most recent sixty. A customer three years in has hundreds, and
           the page rendered every one of them — the figures beside the list
           are counted across the whole history below, so capping the list
           does not cap the numbers. */
        take: 60,
        select: {
          id: true,
          trackingNumber: true,
          ...selectText("description"),
          status: true,
          weightKg: true,
          packages: true,
          registeredAt: true,
          arrivedAt: true,
          deliveredAt: true,
          batch: { select: { batchNumber: true } },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              amountPaid: true,
              status: true,
              sentAt: true,
              issuedAt: true,
            },
          },
        },
      },
      pickupNotes: {
        orderBy: { issuedAt: "desc" },
        take: 20,
        select: {
          id: true,
          noteNumber: true,
          issuedAt: true,
          status: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          channel: true,
          body: true,
          sentAt: true,
          sentBy: { select: { name: true } },
          shipment: { select: { trackingNumber: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          requestNumber: true,
          product: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) return null;

  /*
    THE FIGURES ARE COUNTED ACROSS EVERY CONSIGNMENT, NOT THE PAGE.

    The list above is capped at sixty; these are the whole history. Counting
    them off the capped list would have quietly restated a long-standing
    customer's debt and lifetime value the moment they passed sixty
    consignments, which is the kind of wrong figure nobody notices.

    Only bills actually owed count as debt — the same test receivablesAgeing
    uses. A draft is the system's own price before Finance has agreed it, and a
    written-off bill is one the company decided never to collect.
  */
  const [total, active, completed, owed, paid] = await Promise.all([
    prisma.shipment.count({ where: { customerId: customer.id } }),
    prisma.shipment.count({
      where: {
        customerId: customer.id,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    }),
    prisma.shipment.count({
      where: { customerId: customer.id, status: "DELIVERED" },
    }),
    prisma.invoice.aggregate({
      where: {
        customerId: customer.id,
        status: { in: ["UNPAID", "PARTIALLY_PAID"] },
        shipment: { deletedAt: null },
      },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: { customerId: customer.id, shipment: { deletedAt: null } },
      _sum: { amountPaid: true },
    }),
  ]);

  const outstanding = Math.max(
    0,
    toNumber(owed._sum.total) - toNumber(owed._sum.amountPaid)
  );
  const lifetimeValue = toNumber(paid._sum.amountPaid);

  return {
    customer,
    stats: {
      total,
      active,
      completed,
      outstanding,
      lifetimeValue,
    },
  };
}

/**
 * Tickets opened against tickets closed, day by day.
 *
 * Whether this desk is keeping up. The open count alone cannot say: forty open
 * is fine if forty are closed a day and a crisis if none are, and the number on
 * its own looks identical either way.
 *
 * Closed is counted from resolvedAt — the moment somebody actually finished it,
 * not the moment the row was last touched.
 */
export async function ticketFlowByDay(days = 14, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));

  const [opened, closed] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.supportTicket.findMany({
      where: { resolvedAt: { gte: start } },
      select: { resolvedAt: true },
    }),
  ]);

  const labels: string[] = [];
  const inCounts = Array.from({ length: days }, () => 0);
  const outCounts = Array.from({ length: days }, () => 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    labels.push(d.toLocaleDateString("en-GB", { day: "numeric" }));
  }

  const indexOf = (date: Date) =>
    Math.floor(
      (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
        start.getTime()) /
        86_400_000
    );

  for (const row of opened) {
    const i = indexOf(row.createdAt);
    if (i >= 0 && i < days) inCounts[i] += 1;
  }
  for (const row of closed) {
    if (!row.resolvedAt) continue;
    const i = indexOf(row.resolvedAt);
    if (i >= 0 && i < days) outCounts[i] += 1;
  }

  return { labels, inCounts, outCounts, currentIndex: days - 1 };
}
