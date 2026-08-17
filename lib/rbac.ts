import type { Role } from "@prisma/client";

/**
 * Permission model.
 *
 * Roles are coarse (four departments); permissions are fine. Every server
 * action and every page guard asks for a *permission*, never a role — so
 * adding a fifth department later is a table edit, not a refactor.
 */
export type Permission =
  // Shipments
  | "shipment.view"
  | "shipment.create"
  | "shipment.edit"
  | "shipment.depart"
  | "shipment.cancel"
  /// Soft delete: the record leaves every normal view but keeps its photos,
  /// its packages and its history. A warehouse fixes its own mistakes with
  /// this. Erasing a record for good is `shipment.purge`, and only the CEO
  /// holds that.
  | "shipment.delete"
  | "shipment.purge"
  | "shipment.viewInternal" // internal notes, cost inputs, staff names
  | "shipment.scan" // holds physical cargo and reads its label
  /**
   * Attach the consignment's supporting paperwork, and take a file back off it.
   *
   * Not folded into `shipment.edit`, and the reason is the Dar floor. Editing is
   * gated on the cargo still sitting in China precisely so Dar cannot rewrite
   * China's weights and counts — but Dar is the desk holding the customs entry
   * and the signed damage report. Reusing shipment.edit here would have forced a
   * choice between "Dar cannot file the paperwork it is holding" and "Dar can
   * rewrite the manifest", and the paperwork would have stayed in WhatsApp,
   * which is the whole thing this is for.
   *
   * Every department that talks about a consignment holds it, because every one
   * of them ends up holding one of its documents. What it does NOT carry is any
   * power over the cargo record itself: a file is added beside the record, never
   * into it, and nothing about the shipment changes when one is.
   */
  | "shipment.attach"
  /// Produce the label sticker, and see the code that is printed on it.
  ///
  /// The sticker is made once, in Guangzhou, and travels on the box. Every desk
  /// after that reads it — Dar scans it, Finance quotes the number off it — and
  /// none of them has any reason to make another one. A second sticker for the
  /// same cargo, printed in Dar because a label was scuffed, is two identities
  /// for one box and exactly how a piece goes missing on paper while sitting on
  /// the shelf. Reprints are China's to issue.
  | "label.print"
  // Batches
  | "batch.view"
  | "batch.create"
  | "batch.manage" // add/remove shipments, seal, record flight
  | "batch.receive" // mark arrived in Dar
  | "batch.verify" // tick shipments off the manifest
  /* Draw the line under a flight: shut its books, or open them again. A money
     decision — writing off what will never be collected — so it sits with the
     desks that own money, not with the warehouses that own cargo. */
  | "batch.close"
  /* Read a flight's closing statement and either accept it as the record or
     send it back. The boss's signature, so it is his alone — Finance shuts the
     books, somebody senior agrees they are right. */
  | "statement.review"
  /* Move one consignment from one flight to another. Narrower than
     batch.manage on purpose: correcting which flight a box is on is an
     everyday fix for the desks that talk to customers, and it must not carry
     the power to seal or dispatch a batch with it. */
  | "shipment.move"
  // Exceptions / investigations
  /// Read the Issues & Claims and the cases in it. Every department holds
  /// this, because a case is never one department's business: Dar found the
  /// problem, China packed the box, Support is on the phone to the customer,
  /// Finance may owe them money. Looking is separate from doing — what each
  /// desk may actually *do* to a case is the five permissions below.
  /**
   * The COMPANY's money: the ledger, the accounts, the expenses, the register.
   *
   * Split out of finance.view, which was doing two jobs. Fifteen of its
   * seventeen check sites ask "may this person see what this consignment
   * costs" — which Customer Support must, since they price and chase it. Two
   * ask "may this person see the business's books", which Support must not.
   * One name for both meant the desk that rings customers could open the
   * general ledger.
   */
  | "accounting.view"
  /** Hand a customer's payment proof to Finance. Moves no money. */
  | "payment.submit"
  /** The collections workspace: chasing customers and handing proof to Finance. */
  | "collections.view"
  /**
   * Change what every customer is told: the collection accounts, the office
   * addresses, the phone numbers. The CEO's alone — these appear on invoices,
   * PDFs, WhatsApp messages and the public site simultaneously.
   */
  | "settings.manage"
  /** Agree that a submitted payment is real, and record it. Finance only. */
  | "payment.verify"
  | "exception.view"
  | "exception.raise"
  | "exception.resolve"
  /// Work a case: move it along the lifecycle, add notes and evidence, assign
  /// it, mark cargo found. Everything that is not money and not final.
  | "exception.investigate"
  /// Record what was actually paid out, and attach the payment evidence.
  /// Finance's hand on the till — never the warehouse's.
  | "exception.compensate"
  /// Say yes to a payout or a replacement. The decision, not the payment:
  /// separated so that nobody both approves an amount and pays it.
  | "exception.approve"
  /// Finish a case for good.
  | "exception.close"
  // Finance
  | "finance.view"
  | "invoice.manage"
  | "invoice.edit" // change a bill before the customer has paid anything
  | "invoice.discount"
  | "invoice.send"
  | "payment.record"
  /* Credit sales. Four permissions rather than one, because the whole control
     is that they are held by different people.

     credit.view    — read the credit book: who owes us, how much, how late.
     credit.request — ask for a consignment to be released unpaid. The desk that
                      talks to the customer asks; asking commits nothing.
     credit.approve — grant it. This is the one that releases cargo without
                      payment, so Support does not hold it, and the action
                      additionally refuses anyone approving their own request:
                      the permission split alone is not enough if one person can
                      do both halves.
     credit.limit   — set a customer's standing facility. A bigger decision than
                      any single sale, so it sits with the money side only. */
  | "credit.view"
  | "credit.request"
  | "credit.approve"
  | "credit.limit"
  /// Read a pickup note and print it. Separate from issuing it, because the
  /// two are different authorities: issuing is the act of saying the bill is
  /// settled and the cargo may go, and only Finance does that. Printing the
  /// note Finance already issued is a courtesy anyone at the counter can do.
  | "pickupNote.view"
  | "pickupNote.issue"
  | "pickupNote.cancel"
  | "fx.manage" // publish the USD→TZS rate
  /**
   * See the company's own accounts and what is in them.
   *
   * Distinct from finance.view, which is about a customer's bill. This is the
   * company's cash position, and Support holds finance.view — so every tile
   * that shows what the business is worth is gated on this instead.
   */
  | "account.view"
  /// Add or archive an account, and set the opening balance it started with.
  | "account.manage"
  /// Read the register: every movement in and out, and what it left behind.
  | "ledger.view"
  /// See what the business spends and what it has spent.
  | "expense.view"
  /// Record a cost, attach its receipt, and disburse it from an account.
  | "expense.record"
  /**
   * Approve a cost above the threshold before it can be paid.
   *
   * Separated from expense.record for the reason already established here for
   * compensation: the amount is never both decided and disbursed by the same
   * desk. Below the threshold Finance records and pays in one action, because
   * routing a taxi fare through an approval queue is how a system stops being
   * used by Thursday.
   */
  | "expense.approve"
  /**
   * See what the business EARNED — profit, margin, profit per flight.
   *
   * Deliberately not held by Finance. Their job is to take money in, record
   * what goes out, and know what is in the accounts; whether the business made
   * money on a flight is the owner's question, and putting it on the same desk
   * that sets prices and records costs invites the figure to be managed rather
   * than reported. Revenue and collections are theirs; profit is not.
   */
  | "profit.view"
  /**
   * Write a correcting line into the ledger.
   *
   * The only entry anybody ever types by hand, and the CEO's alone. Everything
   * else in the register is written by the action that moved the money.
   */
  | "ledger.adjust"
  // Delivery
  | "shipment.release"
  | "delivery.history" // cargo already handed over — the Dar release log
  // Dar warehouse floor
  | "inventory.view" // cargo physically held at the Dar warehouse
  | "warehouse.reports" // throughput/exception reporting, scoped to the reader's own floor
  // Customers
  | "customer.view"
  | "customer.manage"
  // Support desk
  | "ticket.manage"
  | "sourcing.manage"
  | "message.send"
  // Administration
  | "user.manage"
  /**
   * Read the rate book, the exchange rate and the product catalogue.
   *
   * Support answers "what will this cost" all day and needs the same numbers
   * Finance bills from — but reading a price and setting one are different
   * authorities, and the owner's split puts only the reading on this desk.
   */
  | "pricing.view"
  /**
   * Change what the business charges: rates, tiers, products, categories.
   *
   * Held by Finance and the CEO. This was CEO-only until the owner moved
   * pricing into the Finance portal — the point of that page is that a price
   * change tomorrow needs Finance, not a developer and not the CEO.
   */
  | "pricing.manage"
  | "audit.view"
  | "report.view";

const CHINA: Permission[] = [
  // This floor's own throughput, not Dar's. The report branches on the reader's
  // warehouse — see app/app/reports. Nothing on it is money; warehouse staff see
  // cargo and time, never a figure.
  "warehouse.reports",
  "shipment.view",
  "shipment.create",
  "shipment.edit",
  // The desk that took the cargo in is the desk that mistyped the weight. Both
  // are limited to cargo still sitting in China — once it is on a plane the
  // record has been invoiced against and printed onto a manifest.
  "shipment.delete",
  "shipment.depart",
  "shipment.viewInternal",
  // The supplier's invoice and the packing list arrive at this desk, with the
  // cargo. Filing them here is the earliest either can be filed.
  "shipment.attach",
  // The desk that packs the box is the desk that labels it, and the only one
  // that reprints a damaged sticker.
  "label.print",
  "batch.view",
  "batch.create",
  "batch.manage",
  "customer.view",
  "customer.manage",
  // Reads the Issues & Claims, and nothing more. When Dar reports a box
  // missing, the question that follows is "was it loaded in Guangzhou?" —
  // which only this desk can answer, and cannot answer if it cannot see the
  // case. Absent: raise, investigate, compensate, approve, close. China does
  // not flag cargo it has already handed to an airline, and does not close a
  // case against its own packing.
  "exception.view",
];

/**
 * Dar warehouse — the desk that receives cargo in Tanzania and hands it over.
 *
 * Its authority starts when the plane lands. It reads the China registration,
 * checks the boxes against it, stores them, and releases them once Finance says
 * the bill is settled. It never writes the China record and never touches money.
 *
 * Deliberately absent, and each for a reason:
 *
 * `shipment.edit` / `shipment.delete` — both are gated on the cargo still being
 * READY_TO_DEPART, which means "still sitting in the China warehouse". Granting
 * them to Dar does not give Dar a way to correct cargo it is holding; it gives
 * Dar a way to rewrite and soft-delete China's cargo that has not flown yet —
 * exactly the thing the spec forbids. A weight or count that disagrees with the
 * manifest is raised as an exception (`exception.raise`), which is a record of
 * the disagreement, not a silent overwrite of it.
 *
 * Also absent: shipment.create, batch.create, batch.manage (batches are China's
 * and management's), and every finance/invoice/payment permission — Finance
 * confirms payment and issues the pickup note, Dar only scans it.
 */
const DAR: Permission[] = [
  "shipment.view",
  "shipment.viewInternal",
  // The customs entry, the duty receipt, the inspection note. This floor is
  // where that paper physically is, and it is not shipment.edit — see the
  // permission's own note for why the two had to be separated.
  "shipment.attach",
  "shipment.scan",
  // Batch data is readable because a shipment names its batch and flight; there
  // is no batch.create / batch.manage here, so there is no way in to managing
  // one.
  "batch.view",
  "batch.receive",
  "batch.verify",
  "exception.view",
  "exception.raise",
  "exception.resolve",
  // Dar works the investigation: reports missing, uploads damage evidence,
  // writes notes, marks cargo found. The owner's CANNOT list is what is absent
  // here — no exception.compensate, no exception.approve, no exception.close.
  // The floor that lost the box does not get to decide what it was worth, and
  // does not get to declare the matter finished.
  "exception.investigate",
  // The desk that physically solves the problem is the desk that records what
  // happened — the owner's spec puts the resolution in the hands of whoever
  // found the box or agreed the damage. The CANNOT list bars Dar from closing
  // *compensation* cases specifically, and that is enforced in the action
  // rather than here: a permission cannot see whether a payout is attached.
  "exception.close",
  "shipment.release",
  "inventory.view",
  "delivery.history",
  "warehouse.reports",
  "customer.view",
];

/**
 * Customer Support — the department that talks to customers.
 *
 * Built from the spec's two lists, and the CANNOT list is the load-bearing one.
 * Support sees everything about a shipment and can bill for it, but cannot
 * touch the cargo or the cash: no registering, no weighing, no status changes,
 * no receiving, no releasing, no recording payments, no pickup notes, no
 * batches. Those stay with the warehouses and Finance.
 *
 * Note what is deliberately absent: payment.record, pickupNote.issue,
 * shipment.create, shipment.edit, shipment.release, batch.create,
 * batch.manage, batch.receive, batch.verify, shipment.cancel.
 */
const CUSTOMER_CARE: Permission[] = [
  "shipment.view",
  // Needed to answer "is my cargo damaged" from the receiving photos and the
  // status history — which is the whole point of the desk existing.
  "shipment.viewInternal",
  // The desk customers send things to. A supplier invoice arrives on WhatsApp
  // and this is where it stops being a message and becomes part of the record.
  "shipment.attach",
  "batch.view",
  "finance.view",
  "invoice.manage",
  "invoice.edit",
  /*
    The desk that agrees a price with a customer is the desk that agrees a
    discount with them. Splitting the two meant Support could change what a
    bill says but not move it down, so every negotiated price went through
    Finance for a keystroke — and the reason for the change lived with whoever
    typed it rather than whoever agreed it. Every use is audited and an
    override still demands a reason.
  */
  "invoice.discount",
  // Correcting which flight a box is on: a customer rings to say their cargo
  // is not on the flight they were told, and this desk takes that call.
  "shipment.move",
  // Reads and prints the note Finance issued, so a customer at the counter is
  // not sent away to find somebody from Finance. It cannot issue one — that is
  // pickupNote.issue, and it means "the bill is settled and the cargo may go".
  "pickupNote.view",
  // Reads the rate book to answer "what will this cost". Cannot change it,
  // and cannot touch the exchange rate — both are pricing.manage / fx.manage,
  // and neither is here.
  "pricing.view",
  "invoice.send",
  // Collects the customer's evidence and hands it up. Deliberately NOT
  // payment.record: this desk never says money arrived, only that a customer
  // says it did. And no accounting.view — they chase invoices, they do not
  // keep the books.
  "payment.submit",
  /* Asks for credit and watches it, and that is the whole of it. Deliberately
     no credit.approve: the desk that agrees terms with a customer over the phone
     must not also be the desk that lets the cargo go unpaid, or the customer's
     charm and the company's exposure meet in one person. */
  "credit.view",
  "credit.request",
  "collections.view",
  "message.send",
  "ticket.manage",
  "sourcing.manage",
  "customer.view",
  "customer.manage",
  "exception.view",
  "exception.raise",
  // The desk that phones the customer while their cargo is being looked for.
  // It monitors cases and writes the communication notes; it never touches the
  // payout — no exception.compensate, no exception.approve, no exception.close.
  "exception.investigate",
];

const FINANCE: Permission[] = [
  // The books are this desk's. Customer Support does not get this one.
  "accounting.view",
  // Finance both submits (they take payments at the counter) and verifies.
  "payment.submit",
  "payment.verify",
  /* The credit book is this desk's: it grants the terms, chases the debt and
     sets the facilities. It can raise a request too — and if it does, the
     approval has to come from someone else, because the no-self-approval rule
     is checked against the person, not the department. */
  "credit.view",
  "credit.request",
  "credit.approve",
  "credit.limit",
  "collections.view",
  "shipment.view",
  "shipment.viewInternal",
  // Finance ends up holding the customs entry and the clearing agent's paper
  // for a consignment, and files it against the cargo rather than only against
  // the cost.
  "shipment.attach",
  // No shipment.scan. Scanning is a warehouse action — somebody standing in
  // front of a box, reading the sticker on it. Finance never has the cargo in
  // their hands; they work from the tracking number a customer reads out, and
  // Search answers that with the same record.
  "batch.view",
  // Finance shuts a flight's books, because closing one is a decision about
  // money owed and not about cargo.
  "batch.close",
  // Correcting which flight a consignment is on. Finance is who notices, from
  // a batch whose figures do not match the cargo standing in the warehouse.
  "shipment.move",
  "finance.view",
  "invoice.manage",
  "invoice.edit",
  "invoice.discount",
  "invoice.send",
  "message.send",
  "payment.record",
  "pickupNote.view",
  "pickupNote.issue",
  "pickupNote.cancel",
  // Finance quotes shillings all day, so Finance keeps the rate current. The
  // rate book — what a kilo costs — stays with the CEO.
  "fx.manage",
  // The company's own money: which accounts exist, what is in them, and every
  // movement through them.
  "account.view",
  // Opening balances and archiving an account. This desk reconciles the
  // accounts, counts the tin and moves money between them — the opening figure
  // comes off a bank statement they are holding, so making them ask the CEO to
  // type it is ceremony, not control.
  "account.manage",
  "ledger.view",
  "expense.view",
  "expense.record",
  /*
    Finance signs off its own spending, and can restate a figure already booked.

    These two were held back on the classic segregation-of-duties argument: the
    desk that records the money should not also get to approve it or restate it.
    The owner has overruled that deliberately — this is an owner-operated
    business where Finance IS the accounting department, and a clearing agent
    at the port does not wait for the CEO to open an approval screen.

    What replaces the control is the record, not nothing. `ledger.adjust` here
    does not mean editing history: the ledger is append-only and a wrong line is
    cancelled by a reversing entry that points back at it, so the register still
    shows what was believed at the time and what corrected it. Every approval,
    correction and reversal is written to the audit log with who, when and why.
    The CEO reads that log; the difference is that they read it afterwards
    instead of standing in the way of it.
  */
  "expense.approve",
  "ledger.adjust",
  // Finance reads the money trail on its own tab. The log is append-only and
  // shows who did what — including what Finance itself did, which is the point.
  "audit.view",
  "customer.view",
  "customer.manage",
  // The Pricing & Configuration centre. Finance owns what the business
  // charges — the whole reason that page exists is that a price change does
  // not need a developer.
  "pricing.view",
  "pricing.manage",
  "exception.view",
  "exception.raise",
  // Records the payout and attaches the evidence for it. Notably absent:
  // exception.approve — Finance pays what the CEO approved, so the amount is
  // never decided and disbursed by the same desk.
  "exception.compensate",
  "report.view",
  /*
    Whether the business made money.

    Withheld from Finance until now on the argument that the desk which sets
    prices and records costs should not also be the one reporting whether the
    result was good. The owner has overruled it: this brief asks Finance for
    batch profitability, Profit & Loss and financial statements by name, and a
    finance department that cannot see the profit figure is a bookkeeping
    desk, not the "complete financial control center" that was asked for.

    The reporting still cannot be quietly managed — every price change, cost,
    correction and reversal behind these figures is in the audit log with a
    name against it, and the CEO reads the same reports.
  */
  "profit.view",
];

/** The CEO sees and can do everything — but is never required to. */
const ALL: Permission[] = Array.from(
  new Set<Permission>([
    ...CHINA,
    ...DAR,
    ...FINANCE,
    ...CUSTOMER_CARE,
    "shipment.cancel",
    // Erasing a record for good. Nobody else has it, at any rank.
    "shipment.purge",
    // What every customer is told: the collection accounts, the office
    // addresses, the phones. One mistyped Lipa number sends every customer's
    // money nowhere, so this stays with the owner and nobody else.
    "settings.manage",
    /*
      Signing off a closed flight's statement.

      Declared beside batch.close and then granted to nobody at all, which did
      not lock the step down — it deleted it. /app/finance/income builds the
      accept/send-back control from can(role, "statement.review"), so it
      rendered for no role including this one, and every statement Finance
      produced sat permanently unreviewed while the code read as though a
      sign-off existed.

      Deliberately here and not in FINANCE. Finance shuts the books
      (batch.close) and somebody senior agrees they are right; one desk holding
      both closes a flight and signs off its own figures, which is the gap the
      review step exists to create. Same reason exception.approve sits here
      while exception.compensate sits with Finance.
    */
    "statement.review",
    // Approving a payout or a replacement, and declaring a case finished.
    // Held by nobody else — including the Dar floor, which the owner's CANNOT
    // list bars from closing compensation cases. Rather than try to tell a
    // money case from a cargo case at the permission layer, no case is closed
    // by the warehouse at all; Dar drives one to CARGO_FOUND or hands it over,
    // and the CEO signs it off. If the owner later wants Dar to close its own
    // no-money cases, that is one line: add "exception.close" to DAR and gate
    // the close action on the case having no Compensation row.
    "exception.approve",
    "exception.close",
    "user.manage",
    "pricing.manage",
    // Opening an account and correcting the ledger. Held by nobody else:
    // Finance records what happened, the CEO is the only one who can restate
    // it, and a correcting line is always visible as one in the register.
    "account.manage",
    "ledger.adjust",
    "profit.view",
    // Signing off a cost above the threshold. Finance records and pays it;
    // the CEO is the one who says yes to it.
    "expense.approve",
    "audit.view",
    "report.view",
  ])
);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  CHINA_WAREHOUSE: CHINA,
  DAR_WAREHOUSE: DAR,
  FINANCE,
  CUSTOMER_CARE,
};

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role | undefined | null, permissions: Permission[]) {
  return permissions.some((p) => can(role, p));
}

/**
 * Route guard table, evaluated longest-prefix-first in middleware and again in
 * the layout. Anything under /app not listed here needs only a valid session.
 *
 * Listed longest-prefix-first for reading; `permissionForPath` sorts anyway, so
 * a misplaced row cannot open a hole.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/app/scan", permission: "shipment.scan" },
  { prefix: "/app/cargo/new", permission: "shipment.create" },
  { prefix: "/app/batches/new", permission: "batch.create" },
  { prefix: "/app/receive", permission: "batch.receive" },
  { prefix: "/app/release", permission: "shipment.release" },
  // The Issues & Claims and every case detail page under it. Read access is
  // its own permission, held by all five departments, because a case concerns
  // all of them at once. What each may *do* to a case is gated action by
  // action on raise / investigate / compensate / approve / close — so China
  // and a read-only visitor reach the same page and are offered nothing on it.
  { prefix: "/app/exceptions", permission: "exception.view" },
  // Chasing customers is not accounting. This workspace is deliberately
  // outside /app/finance so the desk that holds it cannot reach the books.
  { prefix: "/app/collections/verify", permission: "payment.verify" },
  { prefix: "/app/collections", permission: "collections.view" },
  { prefix: "/app/admin/settings", permission: "settings.manage" },
  // The Dar warehouse floor. The arrivals board and the verification bench
  // belong to the desk that receives, so they carry the receiving permissions
  // rather than a new one each.
  { prefix: "/app/incoming", permission: "batch.receive" },
  { prefix: "/app/verification", permission: "batch.verify" },
  { prefix: "/app/inventory", permission: "inventory.view" },
  // Who may collect today is the same authority as handing it over.
  { prefix: "/app/pickup-queue", permission: "shipment.release" },
  // Finding a box is a read; every desk that may see a shipment may look one up.
  { prefix: "/app/search", permission: "shipment.view" },
  { prefix: "/app/deliveries", permission: "delivery.history" },
  // Distinct from /app/admin/reports (report.view): this one is the warehouse's
  // own throughput, not the company's numbers.
  { prefix: "/app/reports", permission: "warehouse.reports" },
  { prefix: "/app/support/sourcing", permission: "sourcing.manage" },
  // The chase list moved to /app/collections/follow-up. This is the old URL,
  // kept as a redirect — it has to be reachable by everyone who can reach
  // where it now points, or the redirect is a wall for exactly the desks the
  // move was for. Longest prefix wins, so this beats the /app/support rule.
  { prefix: "/app/support/follow-up", permission: "collections.view" },
  { prefix: "/app/support", permission: "ticket.manage" },
  { prefix: "/app/finance/exchange-rate", permission: "fx.manage" },
  // NOTE: there is deliberately no /app/finance/compensation row. A guard for
  // it lived here for months over a page that was never built — harmless, in
  // that an absent route cannot be entered, but this table is the one place
  // people read to answer "who can reach what", and a promise about a
  // nonexistent door makes the honest rows harder to trust. Compensation is
  // decided in the Issues & Claims, where the case is; in Finance it appears
  // as a ledger line, not a screen.
  //
  // Ahead of /app/finance because finance.view is also held by Customer Care:
  // the pickup-note register is reachable by Support, which holds finance.view
  // but must not be admitted by it alone.
  { prefix: "/app/finance/pickup-notes", permission: "pickupNote.view" },
  // The company's own money, for the same reason again. finance.view is about
  // a customer's bill; these two are about what the business is worth, and
  // Support has no business in either.
  { prefix: "/app/finance/accounts", permission: "account.view" },
  { prefix: "/app/finance/cash", permission: "account.view" },
  { prefix: "/app/finance/transactions", permission: "ledger.view" },
  // The payments register. It has always been guarded on the page itself, but
  // not here — so Support, who holds finance.view, was admitted by the catch-all
  // below and stopped one layer later. Defence in depth did its job; the table
  // was still saying something untrue about who gets in.
  { prefix: "/app/finance/payments", permission: "payment.record" },
  /* The credit book. Two routes, one permission, because Support reads the same
     page Finance works from — the difference is what the page lets them press,
     and that is decided per action rather than at the door. */
  { prefix: "/app/finance/credit", permission: "credit.view" },
  { prefix: "/app/credit", permission: "credit.view" },
  { prefix: "/app/finance/expenses", permission: "expense.view" },
  { prefix: "/app/finance/reports", permission: "profit.view" },
  { prefix: "/app/finance/audit", permission: "audit.view" },
  // Reading the rate book is pricing.view; every mutation on that page is
  // separately gated on pricing.manage or fx.manage in its own action.
  { prefix: "/app/finance/verify", permission: "payment.verify" },
  { prefix: "/app/finance/pricing", permission: "pricing.view" },
  // An invoice is the customer's bill, not the company's books. Customer
  // Support prices it, sends it and chases it, so it keeps the invoice-level
  // permission rather than falling through to the accounting one below.
  { prefix: "/app/finance/invoices", permission: "finance.view" },
  // The bare prefix is the ledger workspace itself — the business's books.
  // Everything above this line that a non-accounting desk needs has its own
  // rule; longest prefix wins, so those still resolve.
  { prefix: "/app/finance", permission: "accounting.view" },
  { prefix: "/app/admin/deleted", permission: "shipment.cancel" },
  { prefix: "/app/admin/pricing", permission: "pricing.manage" },
  { prefix: "/app/admin/markets", permission: "settings.manage" },
  { prefix: "/app/admin/users", permission: "user.manage" },
  { prefix: "/app/admin/audit", permission: "audit.view" },
  { prefix: "/app/admin", permission: "report.view" },
  { prefix: "/app/customers", permission: "customer.view" },
  { prefix: "/app/shipments", permission: "batch.view" },
  { prefix: "/app/batches", permission: "batch.view" },
  { prefix: "/app/cargo", permission: "shipment.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.filter((r) =>
    pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.permission ?? null;
}

/**
 * Where every role lands after login. The dashboard itself renders the right
 * department view, so there is a single post-login destination.
 */
export const POST_LOGIN_PATH = "/app/dashboard";
