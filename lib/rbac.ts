import type { Role, ShipmentStatus } from "@prisma/client";

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
  /**
   * CUSTODY. The two halves of a consignment's life, and who owns the record in
   * each — the owner's rule, and the reason `canAmendCargo` exists.
   *
   * `amendOutbound` covers cargo still in the Guangzhou warehouse or in the air.
   * `amendLanded` covers cargo from the moment Dar confirms it arrived. Editing,
   * deleting and cancelling all ask one of these beside `shipment.edit` /
   * `shipment.delete` / `shipment.cancel`, so a desk can hold the verb and still
   * be unable to use it on cargo that is not its own.
   *
   * Guangzhou holds outbound because it typed the record and is who notices the
   * mistake; a flight sits in the air for days, which was long enough for a
   * wrong weight to reach Dar with nobody able to touch it. Dar holds landed
   * because by confirming arrival it has said the boxes are here, counted and
   * intact — after that the cargo is on Dar's floor and is Dar's to answer for.
   * The handover is the arrival scan, and it is one-way: Guangzhou cannot reach
   * back into a landed consignment, and Dar cannot reach forward into one that
   * has not arrived.
   */
  | "shipment.amendOutbound"
  | "shipment.amendLanded"
  | "shipment.purge"
  | "shipment.viewInternal" // internal notes, cost inputs, staff names
  | "shipment.scan" // holds physical cargo and reads its label
  /**
   * Attach the consignment's supporting paperwork, and take a file back off it.
   *
   * Not folded into `shipment.edit`, and the reason is custody. Editing follows
   * the cargo — Guangzhou's until it lands, Dar's after — but paperwork does
   * not: the supplier invoice arrives at one end and the customs entry at the
   * other, and both must be filable the day they turn up. Tying this to
   * shipment.edit would have meant Dar could not file the entry in its hand
   * until the plane touched down, and Guangzhou could not add a packing list
   * afterwards, so the paper would have stayed in WhatsApp — which is the whole
   * thing this exists to stop.
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
  /* Answering "it never left Guangzhou" — and only that.

     Held by China, which holds no other power over a case. It is not a general
     close: the action refuses any case except one saying cargo did not arrive,
     it writes no Dar arrival and ticks no package, and what it produces is a
     consignment back on the loading table with its own tracking number, ready
     for the next flight. See markFoundInChina. */
  | "exception.foundInChina"
  // Finance
  | "finance.view"
  | "invoice.manage"
  | "invoice.edit" // change a bill before the customer has paid anything
  | "invoice.discount"
  | "invoice.rate"
  | "invoice.storage.waive"
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
  /// Move money between the company's accounts and count the cash tin. A
  /// write, kept apart from account.view so that granting somebody a look at
  /// the balances never quietly grants them the power to move them.
  | "treasury.move"
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
  | "customer.merge"
  // Support desk
  | "ticket.manage"
  | "sourcing.manage"
  | "message.send"
  // Administration
  | "user.manage"
  | "payroll.prepare"
  | "payroll.approve"
  | "account.reconcile"
  | "record.review"
  | "cargoType.suggest"
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
  /**
   * Read the deleted-records register at /app/admin/deleted.
   *
   * Split off `shipment.cancel`, which was standing in for "senior enough" and
   * so quietly bundled three unrelated things: cancelling a consignment, this
   * register, and taking another desk's file off a shipment. The moment both
   * warehouses were given cancelling — each over its own half of the journey —
   * that bundle would have handed a warehouse the whole company's deleted
   * records. Management only.
   */
  | "records.viewDeleted"
  /**
   * Putting a landed flight back in the air, and putting collected cargo back
   * on the shelf.
   *
   * Both undo a step a warehouse just performed, and both were gated on
   * `shipment.cancel` — which both warehouses hold. So the desk that made the
   * mistake was also the desk that could erase the evidence of it: undoing an
   * arrival unwinds every check-in on the manifest, and undoing a release
   * deletes the handover record and the photographs taken at the counter.
   *
   * Management only, which is what the comments above both actions always
   * claimed and what neither of them enforced.
   */
  | "batch.undoArrival"
  | "delivery.undo"
  /**
   * Take a file off a consignment that somebody else attached.
   *
   * Anyone who may attach can always remove their OWN upload; this is the key
   * for removing another desk's. Also split off `shipment.cancel`, and for the
   * same reason — Guangzhou correcting a weight should not also be able to
   * delete Dar's customs entry. Management only.
   */
  | "document.removeAny"
  | "report.view";

const CHINA: Permission[] = [
  // This floor's own throughput, not Dar's. The report branches on the reader's
  // warehouse — see app/app/reports. Nothing on it is money; warehouse staff see
  // cargo and time, never a figure.
  "warehouse.reports",
  "shipment.view",
  "shipment.create",
  /* Add an item that is not on the list.

     The desk holding the box is the only one that knows what is in it, and an
     unrecognised item is priced on the general rate — which the form itself
     warns is usually wrong. This creates the TYPE and nothing else: what it
     costs is a separate action behind pricing.manage and stays the owner's. So
     the floor can label cargo correctly without being able to price it. */
  "cargoType.suggest",
  "shipment.edit",
  // The desk that took the cargo in is the desk that mistyped the weight.
  "shipment.delete",
  // And the desk that decides a consignment should not travel at all.
  "shipment.cancel",
  /* All three above hold until Dar confirms arrival, and not one minute past
     it — see the custody note on the permission. This floor owns the record
     while the cargo is on its shelf or in the air, which is the whole time it
     is Guangzhou's problem; the arrival scan hands it to Dar. */
  "shipment.amendOutbound",
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
  /*
    THE ONE ANSWER ONLY THIS DESK HAS.

    Dar reports a consignment missing; a week later it is found on a shelf in
    Guangzhou. Until now China could read that case and do nothing about it —
    the box sat in the building that could see the problem and could not touch
    it, and the case stayed open while somebody rang Dar to have it closed
    from 8,000 km away.

    Deliberately narrow, and it does not undo the sentence above. This is not
    closing a case against China's own packing: it is stating a physical fact
    about a box this desk is holding. It refuses every case except one saying
    the cargo did not arrive, and what it produces is a consignment back on
    the loading table — the same tracking number, the same history, ready for
    the next flight.
  */
  "exception.foundInChina",
];

/**
 * Dar warehouse — the desk that receives cargo in Tanzania and hands it over.
 *
 * Its authority starts when the plane lands. It reads the China registration,
 * checks the boxes against it, stores them, and releases them once Finance says
 * the bill is settled. It never writes the China record and never touches money.
 *
 * It edits, deletes and cancels — but only its own half of the journey. At the
 * owner's instruction: by confirming a consignment arrived, this floor has said
 * the boxes are here, counted and intact, and from that scan onward the cargo
 * is standing on Dar's floor and is Dar's to answer for. `shipment.amendLanded`
 * is what makes that half-and-half possible; without it, granting the three
 * verbs here would have let Dar rewrite and delete cargo still sitting in
 * Guangzhou, which is the one thing the spec has always forbidden.
 *
 * Note the direction. Before arrival, a weight that disagrees with the manifest
 * is still an exception (`exception.raise`) — a record of the disagreement, not
 * a silent overwrite of Guangzhou's figures. After arrival, it is simply Dar's
 * record to correct.
 *
 * Deliberately absent: shipment.create, batch.create, batch.manage (batches are
 * China's and management's), records.viewDeleted and document.removeAny (both
 * management), and every finance/invoice/payment permission — Finance confirms
 * payment and issues the pickup note, Dar only scans it.
 */
const DAR: Permission[] = [
  "shipment.view",
  /*
    CARGO THAT ARRIVED WITHOUT A RECORD.

    A box comes off the flight and is not on the manifest — never registered
    in Guangzhou, or registered against another flight. This floor could see
    it, hold it and photograph it, but not record it, so it either sat
    unrecorded or was invented on a screen belonging to another desk.

    It creates that record now. It does not price it and it does not skip the
    check-in: the cargo joins the batch it physically came on and is ticked
    off the manifest like everything else, which is what prices it.
  */
  "shipment.create",
  /* Dar too: they open the box on arrival, and a mislabelled consignment is
     most often caught there rather than in Guangzhou. */
  "cargoType.suggest",
  "shipment.viewInternal",
  // The customs entry, the duty receipt, the inspection note. This floor is
  // where that paper physically is. Separate from shipment.edit because this
  // one holds from the day the cargo is registered — filing Dar's paperwork
  // never depended on whose half of the journey the cargo was in.
  "shipment.attach",
  "shipment.scan",
  /* The floor that is holding the cargo is the floor that corrects its record.
     All three are useless to Dar until the arrival scan — see the custody note
     on shipment.amendOutbound / amendLanded. */
  "shipment.edit",
  "shipment.delete",
  "shipment.cancel",
  "shipment.amendLanded",
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
    NO DISCOUNT FROM THIS DESK.

    This desk did hold it, on the reasoning that whoever agrees a price with a
    customer is whoever agrees a discount with them. The owner has since drawn
    the line differently: giving money away is Finance's, the manager's and his
    own, and Support asks rather than decides. What Support keeps is the rate —
    the line below — because agreeing what today's shillings are worth against
    a dollar bill is the conversation they are actually having on the phone.
  */
  /*
    THE RATE ON ONE BILL — NOT THE RATE BOOK.

    fx.manage publishes the company's rate, which prices every invoice raised
    after it, and that stays with Finance. This is the narrower thing: a bill
    raised weeks ago being settled today at a figure the counter agreed with
    the customer, on that bill and no other.

    The owner asked for the two to be separated. Until now both went through
    fx.manage, on the reasoning that moving a rate moves what a customer owes
    just as surely as a discount does — which is still true, and is why every
    use is audited with a reason. What changed is who is standing in front of
    the customer when it is agreed.
  */
  "invoice.rate",
  /*
    FORGIVING THE STORAGE FEE, WHICH IS NOT A DISCOUNT.

    This desk deliberately has no invoice.discount: a discount is any figure
    off any bill, and that decision belongs to Finance. A storage waiver is
    not that. The amount is not chosen — it is whatever the clock accrued —
    and the conversation is always the same one this desk is already having:
    the customer was late, they are standing at the counter, and somebody has
    to say whether the late days are charged.

    Bounded, audited and reasoned, so it can sit here without handing this
    desk the power to write money off generally.
  */
  "invoice.storage.waive",
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
  /* The desk that hears "but I already paid for the other one" and works out
     that the customer is on the books twice. It is where the duplicate is
     found, so it is where it is closed. */
  "customer.merge",
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
  "invoice.rate",
  "invoice.storage.waive",
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
  "treasury.move",
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
  /* Folding one customer record into another. Finance is the desk that finds
     the duplicate — it surfaces as one customer owing two amounts under two
     codes — so it is the desk that must be able to close it, rather than
     raising it with somebody else and waiting. */
  "customer.merge",
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
  /*
    BUILDS THE SALARY RUN, AND ONLY BUILDS IT.

    The owner's design in his own words: "the finance need to set and prepare
    salary payroll for everyone but the manager is the one who pays". The grant
    was simply missing — Finance was bounced off /app/finance/payroll by the
    very gate the page names — so the flow the owner described could never
    start. payroll.approve stays deliberately absent: the desk that writes the
    figures must not be the desk that agrees them.
  */
  "payroll.prepare",
];

/** The CEO sees and can do everything — but is never required to. */
const ALL: Permission[] = Array.from(
  new Set<Permission>([
    ...CHINA,
    ...DAR,
    ...FINANCE,
    ...CUSTOMER_CARE,
    "shipment.cancel",
    /* Both halves of the journey, so management is never the desk that has to
       wait for a warehouse. Each floor holds one; only this list holds both. */
    "shipment.amendOutbound",
    "shipment.amendLanded",
    /* The two that used to travel inside shipment.cancel. Split out when both
       warehouses were given cancelling, so that neither inherited the deleted
       records register or the right to bin another desk's paperwork. */
    "records.viewDeleted",
    /* Undoing a warehouse's own last step — see the declarations above. */
    "batch.undoArrival",
    "delivery.undo",
    "document.removeAny",
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
    /* Finance BUILDS the salary run — the register, the amounts, the account it
       will be paid from. It does not approve it and cannot pay it. */
    "payroll.prepare",
    // Signing off a cost above the threshold. Finance records and pays it;
    // the CEO is the one who says yes to it.
    "expense.approve",
    "audit.view",
    "report.view",
    /* Signing off the month's salaries. Deliberately absent from the FINANCE
       list above: the desk that writes the figures must not be the desk that
       agrees them, which is the whole reason this run has two steps. */
    "payroll.approve",
    /* Checking an account against something outside this system, and disputing
       a record somebody else entered. Both are in ALL and nowhere else, so they
       resolve to the owner and the manager — the two chairs that answer for the
       figures rather than produce them. Finance is excluded on purpose: a desk
       that could mark its own entry reconciled would make the control a
       formality, which is the one thing it must never be. */
    "account.reconcile",
    "record.review",
  ])
);

/**
 * The manager: everything the owner can SEE, almost nothing the owner can CHANGE
 * about the system itself.
 *
 * Built by subtraction from ALL rather than by listing what to include, and that
 * is the important decision. A manager's job is to run the business, which means
 * the interesting question is never "should they see the ledger" — of course they
 * should — but "what must stay with the owner alone". Adding permissions one at a
 * time to a growing role would have meant every new capability defaulted to
 * WITHHELD from the person running the company, and somebody discovering a gap
 * mid-shift. Subtracting means every new capability defaults to granted, and the
 * five things the owner keeps are named here, in one list, where they can be
 * read and argued with.
 *
 * WHAT THE OWNER KEEPS, and why each one:
 *
 *   settings.manage  The company's own configuration.
 *   pricing.manage   The rate book. A manager reads it — pricing.view — but the
 *                    price of the service is the owner's decision about his own
 *                    business, not an operating control.
 *   account.manage   Opening and closing the company's bank accounts. Managing
 *                    the money that moves through them is the job; deciding which
 *                    accounts exist is ownership.
 *   shipment.purge   Destroying a record for good. Nobody else has it at any
 *                    rank, and a manager is not an exception — deleting is
 *                    already theirs via shipment.cancel, which is reversible.
 */
/*
  STAFFING MOVED TO THE MANAGER, at the owner's instruction: the manager hires,
  assigns and deactivates.

  `user.manage` was on the withheld list, and the reason given was real — whoever
  can grant roles can grant themselves anything, which would make every other line
  above decorative. That risk does not disappear because the owner delegated
  staffing, so it is answered where it actually lives rather than by withholding
  the whole capability: `lib/actions/users.ts` refuses to let anybody but an ADMIN
  create an ADMIN or move somebody into the ADMIN role. A manager can therefore
  build and run the whole team, and still cannot mint an owner — including
  themselves by way of a second account.

  That check belongs in the action, not here, because it is a rule about ONE
  value of ONE field, and permissions cannot express "may edit this column, but
  not to that value".
*/
const MANAGER: Permission[] = ALL.filter(
  (permission) =>
    ![
      "settings.manage",
      "pricing.manage",
      "account.manage",
      "shipment.purge",
    ].includes(permission)
);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  MANAGER,
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

/** Whose floor a consignment's record belongs to, by where the cargo is. */
export type CargoCustody = "OUTBOUND" | "LANDED";

/**
 * Guangzhou's half of the journey, or Dar's.
 *
 * OUTBOUND is the cargo Guangzhou is still answerable for: on its shelf, or in
 * the air. Everything else is LANDED — from the arrival scan onward the boxes
 * are on Dar's floor, and Dar said so by confirming them.
 *
 * The three tail states are deliberately LANDED rather than a third case.
 * UNDER_INVESTIGATION is a box Dar reported it could not find, and Dar works
 * the investigation. DELIVERED and CANCELLED are finished, and a finished
 * consignment is nobody's to retype — in practice only management touches one,
 * and management holds both halves anyway.
 */
export function cargoCustody(status: ShipmentStatus): CargoCustody {
  return status === "READY_TO_DEPART" || status === "IN_TRANSIT"
    ? "OUTBOUND"
    : "LANDED";
}

/**
 * May this desk change this consignment's record at all?
 *
 * Custody, and nothing else — the caller still asks for `shipment.edit`,
 * `shipment.delete` or `shipment.cancel` beside it. Holding the verb is not
 * enough: a warehouse may only use it on cargo that is currently its own, which
 * is what stops Guangzhou reaching into a landed consignment and Dar reaching
 * into one that has not arrived. Management holds both halves and so is never
 * blocked here.
 *
 * It lives here, alone, because these rules used to be spelled out at every
 * call site — both buttons on the cargo page, the edit page deciding whether to
 * open, and each server action — and they had already drifted apart twice. A
 * door that opens on a wider rule than the action behind it is a form that
 * refuses to save.
 */
export function canAmendCargo(
  role: Role | undefined | null,
  status: ShipmentStatus
) {
  return can(
    role,
    cargoCustody(status) === "OUTBOUND"
      ? "shipment.amendOutbound"
      : "shipment.amendLanded"
  );
}

/**
 * Route guard table, evaluated longest-prefix-first in middleware. The /app
 * layout only requires a session — each data-bearing page re-guards itself
 * with requirePermission, and that pair is the whole defence. Anything under
 * /app not listed here needs only a valid session.
 *
 * Listed longest-prefix-first for reading; `permissionForPath` sorts anyway, so
 * a misplaced row cannot open a hole.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/app/scan", permission: "shipment.scan" },
  { prefix: "/app/cargo/new", permission: "shipment.create" },
  /* The printer belongs to the desk that makes stickers, and so does the
     question of whether the app can drive it. */
  { prefix: "/app/tools/printer", permission: "label.print" },
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
  /* Support reaches this too now. They cannot record — the screen submits
     their claim for Finance to verify instead — but ticking a customer's
     several bills is the same act, and a second screen for it would be two
     places where the same mistake can be made in two different ways. Everyone
     who can record can also submit, so this narrows nothing. */
  { prefix: "/app/finance/payments", permission: "payment.submit" },
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
  /* Taking a customer's money is payment.record, not the books-wide
     accounting.view that guards the rest of this section — Support collects at
     the counter and never opens a ledger. Longer prefix, so it is matched
     first. */
  /* Support reaches this too now. They cannot record — the screen submits
     their claim for Finance to verify instead — but ticking a customer's
     several bills is the same act, and a second screen for it would be two
     places where the same mistake can be made in two different ways. Everyone
     who can record can also submit, so this narrows nothing. */
  { prefix: "/app/finance/payments", permission: "payment.submit" },
  { prefix: "/app/finance", permission: "accounting.view" },
  { prefix: "/app/admin/deleted", permission: "records.viewDeleted" },
  { prefix: "/app/admin/pricing", permission: "pricing.manage" },
  { prefix: "/app/admin/markets", permission: "settings.manage" },
  { prefix: "/app/admin/users", permission: "user.manage" },
  { prefix: "/app/admin/audit", permission: "audit.view" },
  { prefix: "/app/admin", permission: "report.view" },
  /* The manager's own pages, guarded on the reviewer's permission rather than
     report.view: Finance also reads reports, and the one desk this portal
     exists to check must not be able to stand inside the workspace that
     checks it. Every action inside still re-checks its own permission at the
     server — a route guard decides which door opens, never what may be done
     once through it. */
  { prefix: "/app/manager", permission: "record.review" },
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
