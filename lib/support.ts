import "server-only";

import type { Prisma } from "@prisma/client";

import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  storageDaysFor,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * What the support desk needs to know, computed rather than stored.
 *
 * The follow-up queue is the important thing here. "Who owes us money" is easy;
 * "who should I call next" is the actual job, and it needs the difference
 * between a customer who has never been sent a bill (send it) and one who was
 * sent it a week ago (chase it). Chasing someone who was never billed is how a
 * good customer gets annoyed, so the queue distinguishes them.
 */

export type FollowUpFilter =
  | "all"
  | "invoice-needed"
  | "not-sent"
  | "awaiting-payment"
  | "ready"
  | "storage";

export const FOLLOW_UP_FILTERS: { key: FollowUpFilter; label: string; hint: string }[] = [
  { key: "all", label: "Everything landed", hint: "All cargo in Dar not yet collected" },
  { key: "invoice-needed", label: "Needs an invoice", hint: "Arrived, never billed" },
  { key: "not-sent", label: "Invoice not sent", hint: "Billed, customer never told" },
  { key: "awaiting-payment", label: "Awaiting payment", hint: "Sent, still unpaid" },
  { key: "ready", label: "Ready for pickup", hint: "Paid, waiting to be collected" },
  { key: "storage", label: "Overdue storage", hint: "Past the free storage window" },
];

export type FollowUpRow = {
  shipmentId: string;
  trackingNumber: string;
  description: string;
  status: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  arrivedAt: string | null;
  daysInWarehouse: number;
  storageDays: number;
  storageCharge: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceNumber: string | null;
  total: number | null;
  outstanding: number | null;
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
 * Everything sitting in the Dar warehouse that has not been collected, with the
 * money and contact state attached.
 *
 * Deliberately not paginated at the database level for the filters, because the
 * desk needs accurate counts on every pill — a filter that says "3" when it
 * means "3 of the first 50" is worse than no number.
 */
export async function followUpQueue() {
  const shipments = await prisma.shipment.findMany({
    where: {
      status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
    },
    orderBy: { arrivedAt: "asc" },
    select: {
      id: true,
      trackingNumber: true,
      description: true,
      status: true,
      arrivedAt: true,
      deliveredAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      invoice: {
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          localCurrency: true,
          sentAt: true,
        },
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { sentAt: true, kind: true },
      },
    },
  });

  const rows: FollowUpRow[] = shipments.map((shipment) => {
    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    const invoice = shipment.invoice;
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
    } else if (!invoice.sentAt) {
      nextAction = "Send the invoice";
      urgency = 70;
    } else {
      const daysSinceSent = daysBetween(invoice.sentAt);
      nextAction =
        daysSinceSent >= 3
          ? `Chase payment — sent ${daysSinceSent} days ago`
          : "Awaiting payment";
      urgency = 50 + Math.min(daysSinceSent * 3, 30);
    }

    // Storage is money leaking away from a customer who has stopped paying
    // attention, so it outranks everything else in the queue.
    if (storageDays > 0) urgency += 25 + Math.min(storageDays * 2, 40);

    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      description: shipment.description,
      status: shipment.status,
      customerId: shipment.customer.id,
      customerName: shipment.customer.name,
      customerPhone: shipment.customer.phone,
      arrivedAt: shipment.arrivedAt?.toISOString() ?? null,
      daysInWarehouse: shipment.arrivedAt ? daysBetween(shipment.arrivedAt) : 0,
      storageDays,
      storageCharge: storageDays * STORAGE_POLICY.perDayUsd,
      invoiceId: invoice?.id ?? null,
      invoiceStatus: invoice?.status ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      total,
      outstanding,
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

  rows.sort((a, b) => b.urgency - a.urgency);
  return rows;
}

export function matchesFilter(row: FollowUpRow, filter: FollowUpFilter) {
  switch (filter) {
    case "invoice-needed":
      // A draft is not a bill: this pill is where cargo waits for one.
      return row.invoiceId === null || row.invoiceStatus === "DRAFT";
    case "not-sent":
      return (
        row.invoiceId !== null &&
        row.invoiceStatus !== "DRAFT" &&
        row.invoiceSentAt === null
      );
    case "awaiting-payment":
      return row.outstanding !== null && row.outstanding > 0;
    case "ready":
      return row.status === "READY_FOR_PICKUP";
    case "storage":
      return row.storageDays > 0;
    case "all":
    default:
      return true;
  }
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
      description: true,
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
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          trackingNumber: true,
          description: true,
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

  const active = customer.shipments.filter(
    (s) => s.status !== "DELIVERED" && s.status !== "CANCELLED"
  );
  const completed = customer.shipments.filter((s) => s.status === "DELIVERED");

  const outstanding = customer.shipments.reduce((sum, shipment) => {
    if (!shipment.invoice) return sum;
    return (
      sum +
      Math.max(
        0,
        toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid)
      )
    );
  }, 0);

  const lifetimeValue = customer.shipments.reduce(
    (sum, shipment) =>
      shipment.invoice ? sum + toNumber(shipment.invoice.amountPaid) : sum,
    0
  );

  return {
    customer,
    stats: {
      total: customer.shipments.length,
      active: active.length,
      completed: completed.length,
      outstanding,
      lifetimeValue,
    },
  };
}
