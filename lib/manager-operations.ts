import "server-only";

import { approvalQueues } from "@/lib/approvals";
import { loadingTables } from "@/lib/batching";
import { collectionsOverview } from "@/lib/collections";
import { BATCH_STATUS_META, ORIGIN_LABELS, STORAGE_POLICY } from "@/lib/constants";
import {
  chinaComposition,
  chinaProblems,
  floorComposition,
  floorFlowByDay,
  floorSnapshot,
} from "@/lib/floor";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import {
  agingInWarehouse,
  chinaStats,
  corridorPosition,
  darStats,
  financeStats,
  receivingQueue,
} from "@/lib/queries";
import type { Permission } from "@/lib/rbac";
import { supportOverview, ticketFlowByDay } from "@/lib/support";
import { todaySummary } from "@/lib/warehouse-home";

/**
 * The cargo journey end to end, and what every department is doing to it.
 *
 * NOT ONE FIGURE ON THIS PAGE IS COMPUTED HERE. Every number below is read off
 * an engine that some desk's own screen already reads — the Guangzhou floor's
 * composition, the Dar floor's snapshot, the receiving queue, the approvals
 * board, the collections desk, the support desk. This file only arranges them
 * into one order: registered → loaded → flown → landed → checked in → cleared →
 * collected.
 *
 * That restraint is the whole point of the file. A manager's operations screen
 * that asked the database its own version of "how much is on the floor" would
 * be a second answer to a question four other screens already answer, and the
 * two would part company inside a quarter — at which point the Monday meeting
 * stops being about the cargo and becomes an argument about whose page is right.
 * Where a figure does not exist as an engine it is NOT invented here; it is
 * either composed from series an engine already returns, or left off with the
 * reason written down (see `batches closed`, below).
 *
 * WHY SOME ENGINE FIELDS ARE DELIBERATELY UNUSED:
 *
 *   corridorPosition() answers five things; only `inAir` is taken. Its onFloor
 *   / ready / flagged are the same cargo floorComposition() splits, and its
 *   split is by shipment status while floorComposition's is by what is actually
 *   holding the box — an active pickup note, an open case. Both are right; two
 *   of them on one screen under near-identical labels is not.
 *
 *   darStats() gives four cargo counts as well as its two batch counts. Only
 *   the batch counts are taken. Its inWarehouse + readyForPickup do not add up
 *   to the floor (cargo under investigation is on neither), and a column whose
 *   parts do not sum to the total printed above them reads as a bug.
 *
 *   chinaStats() gives the staged weight, which nothing else carries, so the
 *   kilos come from there. Its readyToDepart is the same count as
 *   chinaComposition().total — the composition is used, because its three parts
 *   add to it and can therefore be shown underneath it.
 *
 * STORAGE IS COUNTED IN DAYS, NEVER MONEY. The owner's standing rule, and it
 * holds here without exception: cargo that has overstayed shows the number of
 * days it has been standing and nothing else. What that eventually costs is
 * worked out at the counter, at the moment somebody pays — `storageStatus()` in
 * lib/constants.ts — and putting a running charge on an operations screen would
 * quote a customer a figure nobody has agreed to.
 */

/** One step of the journey, with the list that proves the figure. */
export type OpsStage = {
  key: string;
  /** Already translated. */
  label: string;
  value: number;
  /** A second fact under the figure, already translated. Null when there is none. */
  detail: string | null;
  /** The list a reader opens to check the number for themselves. */
  href: string;
  /**
   * What that list needs. Finance reaches this page — report.view plus
   * batch.view — and holds neither inventory.view nor batch.receive, so a
   * figure they cannot open is shown as a figure rather than as a dead link.
   */
  permission: Permission;
  tone: "plain" | "warn";
};

/** A batch, as a row somebody clicks through to the batch itself. */
export type OpsBatch = {
  id: string;
  batchNumber: string;
  /** The real route, read off the app rather than guessed. */
  href: string;
  /** Translated status word. */
  state: string;
  origin: string;
  cargo: number | null;
  /** Days standing at this stage. Days, never money. */
  days: number | null;
  /** What the days are counting, already translated. */
  daysLabel: string | null;
  note: string | null;
};

export type OpsLeg = {
  key: "china" | "dar";
  place: string;
  /** The headline: how much cargo is standing at this end right now. */
  standing: number;
  standingLabel: string;
  standingDetail: string | null;
  stages: OpsStage[];
  batchesLabel: string;
  batches: OpsBatch[];
  batchesHref: string;
  batchesPermission: Permission;
  /** Nothing to click through to; said in words rather than left blank. */
  batchesEmpty: string;
};

/** What a desk has waiting, what it finished today, and what is wrong on it. */
export type OpsDeskRow = {
  key: "pending" | "today" | "issues";
  label: string;
  value: number;
  detail: string | null;
  href: string;
  permission: Permission;
};

export type OpsDesk = {
  /** Matches DeskPulse.key, so these rows read as the same desk's card. */
  key: "china" | "dar" | "finance" | "support";
  desk: string;
  rows: OpsDeskRow[];
};

export type OpsStorage = {
  freeDays: number;
  overdue: number;
  longestDays: number;
  rows: {
    id: string;
    trackingNumber: string;
    customer: string;
    days: number;
    href: string;
  }[];
};

export type ManagerOperations = {
  china: OpsLeg;
  dar: OpsLeg;
  /** The stretch between the two columns: what is in the air right now. */
  corridor: {
    cargo: number;
    batches: number;
    weightKg: number;
    href: string;
    permission: Permission;
  };
  desks: OpsDesk[];
  storage: OpsStorage;
  /** The last flight whose books were shut, for the reason in the comment below. */
  lastClosed: { batchNumber: string; href: string; days: number | null } | null;
};

const DAY = 86_400_000;

/** The batch page, found by reading the app's routes rather than assumed. */
const batchHref = (id: string) => `/app/shipments/${id}`;
/** The two loading tables live on their own screen; a table is not a flight. */
const tableHref = (id: string) => `/app/batches/${id}`;

export async function managerOperations(
  locale: Locale = "en",
  now = new Date()
): Promise<ManagerOperations> {
  /* A sentence with a number in it can never be looked up whole — the figure is
     baked in before the dictionary sees the string. Composed from a translated
     fragment plus the number, the same idiom deskPulse() uses, which is the only
     way these lines reach Chinese. */
  const count = (n: number, phrase: string) => `${n.toLocaleString()} ${t(locale, phrase)}`;
  const say = (phrase: string) => t(locale, phrase);

  const [
    china,
    chinaFaults,
    chinaToday,
    staged,
    tables,
    corridor,
    dar,
    queue,
    floor,
    split,
    floorFlow,
    oldest,
    approvals,
    collections,
    finance,
    support,
    ticketFlow,
  ] = await Promise.all([
    chinaComposition(),
    chinaProblems(now),
    todaySummary(),
    chinaStats(),
    loadingTables(prisma),
    corridorPosition(),
    darStats(),
    /* Six, not the default fifteen: this is the batch rail on a command centre,
       not the receiving bench. The rows are ordered by that engine with the
       work that needs hands first, so a short take is the top of the queue. */
    receivingQueue({ verifiedLimit: 6 }),
    floorSnapshot(),
    floorComposition(),
    floorFlowByDay(14, now),
    agingInWarehouse(6),
    approvalQueues(now),
    collectionsOverview(),
    financeStats(),
    supportOverview(),
    ticketFlowByDay(14, now),
  ]);

  const collectedToday = floorFlow.outCounts[floorFlow.currentIndex] ?? 0;
  const receivedToday = floorFlow.inCounts[floorFlow.currentIndex] ?? 0;
  const collectedFortnight = floorFlow.outCounts.reduce((sum, n) => sum + n, 0);
  const ticketsClosedToday = ticketFlow.outCounts[ticketFlow.currentIndex] ?? 0;

  /* Cargo standing in Guangzhou, and the same list every time. There is no
     "registered on a given day" filter on the cargo screen, so today's
     registrations prove themselves at the top of that list, which is sorted
     newest first and carries the date and the batch as columns. */
  const chinaList = "/app/cargo?status=READY_TO_DEPART";

  const chinaLeg: OpsLeg = {
    key: "china",
    place: say("Guangzhou"),
    standing: china.total,
    standingLabel: say("standing in China"),
    standingDetail: `${count(chinaToday.shipments, "registered today")} · ${Math.round(
      staged.stagedWeightKg
    ).toLocaleString()} ${say("kg staged")}`,
    stages: [
      {
        key: "pending",
        label: say("Waiting for a loading table"),
        value: china.unassigned,
        detail: say("registered, on no batch yet"),
        href: chinaList,
        permission: "shipment.view",
        tone: china.unassigned > 0 ? "warn" : "plain",
      },
      {
        key: "loading",
        label: say("On a loading table"),
        value: china.loading,
        detail: count(tables.length, "tables open"),
        href: "/app/batches",
        permission: "batch.view",
        tone: "plain",
      },
      {
        key: "sealed",
        label: say("Sealed, waiting for the flight"),
        value: china.sealed,
        detail: say("ready to load"),
        href: "/app/shipments",
        permission: "batch.view",
        tone: "plain",
      },
      {
        key: "stale",
        label: `${say("Standing more than")} ${chinaFaults.staleDays} ${say("days")}`,
        value: chinaFaults.waiting,
        detail: chinaFaults.noPhotos > 0 ? count(chinaFaults.noPhotos, "with no photograph") : null,
        href: chinaList,
        permission: "shipment.view",
        tone: chinaFaults.waiting > 0 ? "warn" : "plain",
      },
    ],
    batchesLabel: say("Loading tables"),
    /*
      The tables carry no piece count here, and that is deliberate rather than
      an omission. loadingTables() counts every shipment sitting on a table;
      /app/batches — the screen this row opens — counts only the cargo still
      waiting to fly. One cancelled box left on a table is enough to make the
      two disagree by one, and a manager who spots that difference is right to
      stop trusting both. The numbers for this end of the journey are the stage
      figures above, which come from the composition; these rows are the way
      through to the table itself.
    */
    batches: tables.map((table) => ({
      id: table.id,
      batchNumber: table.batchNumber,
      href: tableHref(table.id),
      state: say(BATCH_STATUS_META.OPEN.label),
      origin: say(ORIGIN_LABELS[table.origin]),
      cargo: null,
      days: null,
      daysLabel: null,
      note: null,
    })),
    batchesHref: "/app/batches",
    batchesPermission: "batch.view",
    batchesEmpty: say("No loading table is set up."),
  };

  /* ARRIVED and IN_TRANSIT only. The engine also returns recently verified and
     closed flights, and they belong at the end of this column as one line
     rather than as rows in a rail whose job is "what still needs hands". */
  const live = queue.rows.filter(
    (row) => row.status === "ARRIVED" || row.status === "IN_TRANSIT"
  );

  /*
    "Batches closed" as a period total is NOT here, and the reason is worth
    stating. The one engine that answers it is financeDashboard(window).volume
    .batchesClosed, which computes a full profit-and-loss twice to do so — the
    Management report and the Finance overview already carry it, and dragging a
    P&L onto an operations screen to print one integer would make this page slow
    for a figure that is not an operations question. What IS an operations
    question is whether flights are still being signed off, so the most recent
    one is named, dated in days, and clickable.
  */
  /* Sorted by when the books were actually shut, not by the queue's own order —
     that one puts the longest-waiting flight first, which for a closed batch is
     the oldest one, the exact opposite of "the last one signed off". */
  const closed = queue.rows
    .filter((row) => row.status === "CLOSED" && row.verifiedAt)
    .sort((a, b) => (a.verifiedAt! < b.verifiedAt! ? 1 : -1))[0];
  const lastClosed = closed
    ? {
        batchNumber: closed.batchNumber,
        href: batchHref(closed.id),
        days: closed.verifiedAt
          ? Math.max(0, Math.floor((now.getTime() - new Date(closed.verifiedAt).getTime()) / DAY))
          : null,
      }
    : null;

  const darLeg: OpsLeg = {
    key: "dar",
    place: say("Dar es Salaam"),
    standing: floor.shipments,
    standingLabel: say("standing on the floor"),
    standingDetail: `${count(floor.packages, "boxes")} · ${Math.round(
      floor.weightKg
    ).toLocaleString()} ${say("kg")}`,
    stages: [
      {
        key: "arrived",
        label: say("Landed, awaiting check-in"),
        value: dar.awaitingCheck,
        detail:
          queue.summary.uncheckedShipments > 0
            ? count(queue.summary.uncheckedShipments, "pieces still to tick off")
            : say("every piece ticked off"),
        href: "/app/receive",
        permission: "batch.receive",
        tone: queue.summary.uncheckedShipments > 0 ? "warn" : "plain",
      },
      {
        key: "received",
        label: say("Checked in today"),
        value: receivedToday,
        detail: say("ticked off a manifest since midnight"),
        href: "/app/inventory",
        permission: "inventory.view",
        tone: "plain",
      },
      {
        key: "held",
        label: say("In the warehouse, not cleared"),
        value: split.held,
        detail: say("waiting on Finance before it can go"),
        href: "/app/cargo?status=RECEIVED_AT_DAR",
        permission: "shipment.view",
        tone: "plain",
      },
      {
        key: "cleared",
        label: say("Cleared, waiting to be collected"),
        value: split.cleared,
        detail: say("paid for, pickup note live"),
        href: "/app/pickup-queue",
        permission: "shipment.release",
        tone: "plain",
      },
      {
        key: "flagged",
        label: say("Held under a case"),
        value: split.flagged,
        detail: say("not going anywhere until it is ruled on"),
        href: "/app/exceptions",
        permission: "exception.view",
        tone: split.flagged > 0 ? "warn" : "plain",
      },
      {
        key: "collected",
        label: say("Collected today"),
        value: collectedToday,
        detail: count(collectedFortnight, "in the last fortnight"),
        href: "/app/deliveries",
        permission: "delivery.history",
        tone: "plain",
      },
      {
        key: "overdue",
        label: `${say("Standing past the free")} ${STORAGE_POLICY.freeDays} ${say("days")}`,
        value: floor.aging,
        /* Days, never a charge. The clause about cleared cargo is what keeps
           this figure from reading as a contradiction of the Dar desk card,
           which counts only cargo Finance has not released yet. */
        detail: `${say("longest")} ${floor.longestHeldDays} ${say(
          "days"
        )} · ${say("cleared cargo counted too")}`,
        href: "/app/inventory",
        permission: "inventory.view",
        tone: floor.aging > 0 ? "warn" : "plain",
      },
    ],
    batchesLabel: say("Flights inbound and on the floor"),
    batches: live.map((row) => ({
      id: row.id,
      batchNumber: row.batchNumber,
      href: batchHref(row.id),
      state: say(BATCH_STATUS_META[row.status].label),
      origin: say(ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ?? row.origin),
      cargo: row.shipments,
      days: row.waitDays,
      daysLabel: row.status === "ARRIVED" ? say("on the floor") : say("in the air"),
      note:
        row.status === "ARRIVED"
          ? row.unchecked > 0
            ? count(row.unchecked, "still to check in")
            : say("all checked in")
          : `${row.packages.toLocaleString()} ${say("boxes")}`,
    })),
    batchesHref: "/app/receive",
    batchesPermission: "batch.receive",
    batchesEmpty: say("Nothing in the air and nothing waiting to be checked in."),
  };

  /* Cargo already on the Dar floor whose days are the finding. agingInWarehouse
     also carries each bill; nothing here reads it — see the storage rule at the
     top of this file. */
  const storage: OpsStorage = {
    freeDays: STORAGE_POLICY.freeDays,
    overdue: floor.aging,
    longestDays: floor.longestHeldDays,
    rows: oldest
      .filter((row) => row.arrivedAt)
      .map((row) => ({
        id: row.id,
        trackingNumber: row.trackingNumber,
        customer: row.customer.name,
        days: Math.max(0, Math.floor((now.getTime() - row.arrivedAt!.getTime()) / DAY)),
        href: `/app/cargo/${row.id}`,
      })),
  };

  /* Finance's own queues, and only those. `claims` in the approvals engine is a
     cargo case — it is answered on the Dar column above, and counting it as
     Finance's backlog too would make one open claim two pieces of pending work. */
  const financeQueues = approvals.filter((queue) => queue.key !== "claims");
  const financePending = financeQueues.reduce((sum, queue) => sum + queue.count, 0);
  const financeOldest = financeQueues.reduce<number | null>(
    (worst, queue) =>
      queue.oldestDays === null ? worst : worst === null ? queue.oldestDays : Math.max(worst, queue.oldestDays),
    null
  );

  const desks: OpsDesk[] = [
    {
      key: "china",
      desk: say("Guangzhou"),
      rows: [
        {
          key: "pending",
          label: say("Waiting for a table"),
          value: china.unassigned,
          detail: null,
          href: chinaList,
          permission: "shipment.view",
        },
        {
          key: "today",
          label: say("Registered today"),
          value: chinaToday.shipments,
          detail: count(chinaToday.photos, "photographs filed"),
          href: chinaList,
          permission: "shipment.view",
        },
        {
          key: "issues",
          /* The desk card beside this one already names the cargo with no
             photograph. This is the other failure that desk owns: a table left
             open long enough to stop being a batch and become a shelf. */
          label: say("Tables left open too long"),
          value: chinaFaults.staleBatches,
          detail: null,
          href: "/app/batches",
          permission: "batch.view",
        },
      ],
    },
    {
      key: "dar",
      desk: say("Dar floor"),
      rows: [
        {
          key: "pending",
          label: say("Pieces still to check in"),
          value: queue.summary.uncheckedShipments,
          detail: count(dar.awaitingCheck, "flights on the floor"),
          href: "/app/receive",
          permission: "batch.receive",
        },
        {
          key: "today",
          label: say("Handled today"),
          value: receivedToday + collectedToday,
          detail: `${count(receivedToday, "in")} · ${count(collectedToday, "out")}`,
          href: "/app/inventory",
          permission: "inventory.view",
        },
        {
          key: "issues",
          label: say("Cases against floor cargo"),
          value: split.flagged,
          detail: null,
          href: "/app/exceptions",
          permission: "exception.view",
        },
      ],
    },
    {
      key: "finance",
      desk: say("Finance"),
      rows: [
        {
          key: "pending",
          label: say("Decisions waiting"),
          value: financePending,
          detail:
            financeOldest === null
              ? null
              : financeOldest === 0
                ? say("oldest today")
                : `${say("oldest")} ${financeOldest}${say("d")}`,
          href: "/app/manager/approvals",
          permission: "report.view",
        },
        {
          key: "today",
          label: say("Payments verified today"),
          value: collections.verifiedToday,
          detail: null,
          href: "/app/finance/verify",
          permission: "payment.verify",
        },
        {
          key: "issues",
          label: say("Landed with no confirmed bill"),
          value: finance.awaitingInvoice,
          detail: say("cargo nobody has been asked to pay for"),
          href: "/app/finance/invoices",
          permission: "finance.view",
        },
      ],
    },
    {
      key: "support",
      desk: say("Support"),
      rows: [
        {
          key: "pending",
          label: say("Tickets ours to move"),
          value: support.waitingOnUs,
          detail: count(support.openRequests, "sourcing requests open"),
          href: "/app/support",
          permission: "ticket.manage",
        },
        {
          key: "today",
          label: say("Tickets closed today"),
          value: ticketsClosedToday,
          detail: count(support.contactedToday, "customers contacted"),
          href: "/app/support",
          permission: "ticket.manage",
        },
        {
          key: "issues",
          label: say("Urgent and unanswered"),
          value: support.urgentTickets,
          detail: null,
          href: "/app/support",
          permission: "ticket.manage",
        },
      ],
    },
  ];

  return {
    china: chinaLeg,
    dar: darLeg,
    corridor: {
      cargo: corridor.inAir,
      batches: dar.incoming,
      weightKg: queue.summary.inAirWeightKg,
      href: "/app/receive",
      permission: "batch.receive",
    },
    desks,
    storage,
    lastClosed,
  };
}
