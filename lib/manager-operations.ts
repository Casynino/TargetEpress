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
 * into one order — registered → loaded → flown → landed → checked in → cleared
 * → collected — and splits each leg between the cargo standing still and the
 * desk working it, per ONE FIGURE, ONE HOME below.
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
 * ONE FIGURE, ONE HOME. The page draws each leg twice — the journey column on
 * top, the desk card underneath — and the same number printed in both places is
 * not reassurance, it is a reader wondering which of the two moved. So the two
 * surfaces are divided by what they are for, and nothing crosses:
 *
 *   the journey column carries CARGO STANDING STILL, in slices that add up to
 *   the headline above them (`held` + `cleared` + `flagged` = the floor), plus
 *   the two edges of the leg — what has landed but is not checked in, and what
 *   has overstayed;
 *
 *   the desk card carries THE DESK'S OWN DAY — what is queued for it, what it
 *   finished since midnight, what is open against it.
 *
 * Where that leaves a card with two rows instead of three, it has two rows. A
 * third row repeating a figure from the column an inch above it would be worth
 * less than the white space.
 *
 * THE DESK PULSE PANEL SITS ON THIS PAGE TOO, and it is not ours to reword —
 * the owner reads the same cards. It answers some of these questions with a
 * NARROWER population than this file does: its "on the floor" is RECEIVED_AT_DAR
 * alone, and its storage problem line counts only cargo Finance has not cleared.
 * Where our population is wider, our WORDS have to say so out loud; two
 * different numbers under the same phrase on one screen is the worst thing this
 * page could do. Each such label is commented where it is built.
 *
 * WHY SOME ENGINE FIELDS ARE DELIBERATELY UNUSED:
 *
 *   corridorPosition() is not read here at all, though it looks like exactly
 *   the engine the in-the-air bar wants. Its `inAir` counts SHIPMENTS at status
 *   IN_TRANSIT, and receiveBatch() does not touch shipment statuses when a
 *   flight lands — cargo stays IN_TRANSIT until somebody ticks it off a
 *   manifest. So that count keeps counting boxes that are already standing in
 *   Dar, which the same screen then counts again as the check-in backlog. The
 *   bar reads the receiving queue's own batch rows instead, so its pieces, its
 *   flights and its kilos are three facts about one set of aircraft.
 *
 *   darStats() gives four cargo counts and two batch counts. Only awaitingCheck
 *   is taken. Its inWarehouse + readyForPickup do not add up to the floor (cargo
 *   under investigation is on neither), and a column whose parts do not sum to
 *   the total printed above them reads as a bug; its `incoming` is the same
 *   flights the receiving queue already counted for the bar.
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
  const ticketsClosedToday = ticketFlow.outCounts[ticketFlow.currentIndex] ?? 0;

  /* The pieces riding on flights that have not landed — counted off the very
     rows the receiving queue sums its in-air kilos from, so the bar's pieces,
     flights and kilos are three readings of one set of aircraft. Composed here
     rather than queried: this is the queue's own series added up, not a second
     opinion about what "in the air" means. */
  const inAirCargo = queue.rows
    .filter((row) => row.status === "IN_TRANSIT")
    .reduce((sum, row) => sum + row.shipments, 0);

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
    /* Kilos only. What was registered today is this desk's day, not the state
       of its floor, and it is the middle row of the Guangzhou card below —
       printed in both places it became a figure a reader had to reconcile. */
    standingDetail: `${Math.round(staged.stagedWeightKg).toLocaleString()} ${say("kg staged")}`,
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
        /* The cargo with no photograph used to hang here. It is the Guangzhou
           pulse card's problem line on this same screen, and the pulse is the
           panel the owner reads — one desk's failure said once, by the panel
           that says every desk's failure. */
        detail: say("waiting since it was registered"),
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
    /* NOT "on the floor". The pulse card further down this same screen prints
       that exact phrase over a SMALLER number — RECEIVED_AT_DAR alone, the
       cargo Finance has not released — while this counts everything checked in
       and not yet handed over, cleared cargo included. Two populations, so two
       forms of words; the alternative, narrowing this to match the pulse, would
       stop the three slices below adding up to the figure they sit under. */
    standingLabel: say("standing, cleared or not"),
    standingDetail: `${count(floor.packages, "boxes")} · ${Math.round(
      floor.weightKg
    ).toLocaleString()} ${say("kg")}`,
    stages: [
      {
        key: "arrived",
        /* Counted in pieces, like every other row in this column. The FLIGHTS
           those pieces are riding are the Dar card's queue below — the two
           were printed here as a figure and its own detail line, each the
           other's caption, which is one number too many for one row. */
        label: say("Landed, awaiting check-in"),
        value: queue.summary.uncheckedShipments,
        detail:
          queue.summary.uncheckedShipments > 0
            ? say("pieces, on flights already on the floor")
            : say("every piece ticked off"),
        href: "/app/receive",
        permission: "batch.receive",
        tone: queue.summary.uncheckedShipments > 0 ? "warn" : "plain",
      },
      {
        key: "held",
        /* floorComposition().held, which is cargo with no live pickup note AND
           no open case — the case takes precedence, so it is counted one row
           down instead. floorSnapshot().unpaid answers the same question the
           other way, counting flagged cargo as unpaid too; the composition is
           used because its three slices add to the headline above. The label
           has to say which of the two it is, or the manager reading the Dar
           overview next to this one is looking at two "not cleared" figures. */
        label: say("Not cleared, no case open"),
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
        /* The third slice of the floor, and the Dar card below does not repeat
           it: an open case is a state the cargo is standing in, which is this
           column's subject, not a queue the warehouse works through. */
        label: say("Held under a case"),
        value: split.flagged,
        detail: say("not going anywhere until it is ruled on"),
        href: "/app/exceptions",
        permission: "exception.view",
        tone: split.flagged > 0 ? "warn" : "plain",
      },
      {
        key: "overdue",
        /* "Whole floor", not "standing past" — the pulse card below says "past
           the free storage window" over a narrower count, cargo Finance has not
           released. This one counts cleared cargo too: a customer who has paid
           and left the boxes here is still using the shelf. Days, never a
           charge — what that costs is worked out at the counter. */
        label: `${say("Whole floor past the free")} ${STORAGE_POLICY.freeDays} ${say("days")}`,
        value: floor.aging,
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
      /* No "waiting" row. Guangzhou's queue is cargo on no batch yet, and that
         is the first slice of the journey column above — one of the three that
         add up to the figure standing in China. It cannot leave that column
         without breaking the sum, so it does not appear twice. */
      rows: [
        {
          key: "today",
          label: say("Registered today"),
          value: chinaToday.shipments,
          /* "every desk", because todaySummary() counts every shipment photo
             filed since midnight — Dar's damage shots and delivery proofs among
             them — and there is no China-scoped photo engine to read instead.
             Scoping it here would mean this file asking the database its own
             question, which is the one thing it does not do; so the label says
             what the query actually counts. */
          detail: count(chinaToday.photos, "photographs filed, every desk"),
          href: chinaList,
          permission: "shipment.view",
        },
        {
          key: "issues",
          /* The pulse card above already names the cargo with no photograph.
             This is the other failure that desk owns: a table left open long
             enough to stop being a batch and become a shelf. */
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
      /* No "open" row. The cases against floor cargo are the last slice of the
         journey column above, where they belong — a case is a state cargo is
         standing in, and moving it here would print the same count twice. */
      rows: [
        {
          key: "pending",
          /* Flights, not pieces: the pieces are the first row of the column
             above, and this is the unit the bench actually works in — a
             receiving clerk opens a flight and ticks it off. */
          label: say("Flights waiting to be checked in"),
          value: dar.awaitingCheck,
          detail: null,
          href: "/app/receive",
          permission: "batch.receive",
        },
        {
          key: "today",
          /* The only home on this page for what the floor did since midnight.
             It was here AND as two rows of the journey column above, which made
             three renderings of two numbers; the column is about cargo standing
             still, so the day's movement lives on the desk that did it. */
          label: say("Handled today"),
          value: receivedToday + collectedToday,
          detail: `${count(receivedToday, "in")} · ${count(collectedToday, "out")}`,
          href: "/app/inventory",
          permission: "inventory.view",
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
          /* NOT "landed". financeStats().awaitingInvoice counts cargo at
             RECEIVED_AT_DAR *and* IN_TRANSIT whose only invoice is a draft or
             absent, so a box still over the Indian Ocean is in it — and cargo
             that has not landed cannot be late to bill. Renamed rather than
             narrowed: the same field is Finance's own queue on its own screen,
             and a second, arrived-only version of it computed here would give
             the manager and the finance clerk two answers to one question. */
          label: say("Cargo with no confirmed bill"),
          value: finance.awaitingInvoice,
          detail: say("in the air or on the floor, nobody billed yet"),
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
          /* Messages, not people. contactedToday is a straight count of
             customerMessage rows since midnight, so five calls to one trader
             read as five traders under the old wording. Counting distinct
             customers would need a new query in this file, which is the thing
             it does not do; the honest label is the one the query supports. */
          detail: count(support.contactedToday, "messages sent"),
          href: "/app/support",
          permission: "ticket.manage",
        },
        {
          key: "issues",
          /* Nothing in the schema records whether a ticket has been answered.
             This counts OPEN and IN_PROGRESS tickets at HIGH or URGENT — a
             ticket somebody is working on right now is in it, and so is a
             merely high-priority one, so it cannot claim either "urgent" alone
             or "unanswered". */
          label: say("High or urgent, still open"),
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
    /* All three off the receiving queue's in-air batch rows, so the bar's
       pieces, flights and kilos are one population described three ways. The
       pieces used to come from corridorPosition().inAir and the other two from
       the batches, which put every box on a landed-but-unchecked flight into
       the airborne headline AND into the Dar check-in backlog on the same
       screen — cargo counted twice, in two places a manager acts on. */
    corridor: {
      cargo: inAirCargo,
      batches: queue.summary.inAir,
      weightKg: queue.summary.inAirWeightKg,
      href: "/app/receive",
      permission: "batch.receive",
    },
    desks,
    storage,
    lastClosed,
  };
}
