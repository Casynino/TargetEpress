# Target Express Air Cargo — what was delivered

_Live at target-epress.vercel.app. Prepared 11 August 2026.__

## 1. What this replaces

Right now, a business like this runs on four things: a WhatsApp thread per customer, a notebook or Excel sheet at each warehouse, a printed manifest that travels with the flight, and one or two people who simply remember what is going on. That works up to a point, and then it starts costing money in ways that are hard to see on a bank statement.

**Cartons that go missing on paper.** Cargo is counted at the box, but tracked at the consignment. A customer sends fifteen cartons; fourteen arrive; nobody can prove whether the fifteenth was ever loaded in Guangzhou or walked off the shelf in Dar. Without a per-box record, the argument is one person's memory against another's, and the company usually pays.

**Disputed weights.** The weight recorded in China is the number the customer is billed on. If it lives in a spreadsheet that anyone can retype, then every dispute — "you told me six kilos" — is unanswerable, and every correction after the fact is indistinguishable from a fiddle.

**Cargo released without payment.** This is the direct loss. A customer arrives at the counter, is known to the clerk, is friendly, says Finance cleared it, and walks out with the boxes. On a WhatsApp system there is no gate — the gate is the clerk's judgement at the end of a long day. One released consignment a month at a few hundred dollars is a five-figure annual leak that never appears as a line item, because it looks like a receivable rather than a loss.

**Storage nobody charged for.** Free storage runs seven days, then accrues daily. On paper, storage is charged when someone remembers to look at the arrival date and do the arithmetic — which is to say, almost never, and never on the customers who most need charging.

**Invoices priced from the wrong rate.** With a rate sheet in a spreadsheet and an exchange rate someone types from memory, last month's invoice and this month's are quoted off different numbers with no record of which was which. Reissue an old bill six months later and it prints a different figure than the customer was told, which is a dispute you cannot win.

**And the time.** Every "where is my cargo" question is a staff member opening a chat history. Every "what do I owe" is a phone call. Every "what will this cost from Yiwu" is a conversation. At 100+ active customers that is most of a full-time job, spent on questions the customer could answer themselves in ten seconds.

## 2. What was built

A complete operations platform, live and running the business today: 129 consignments, 112 customers, five staff roles across two continents. 95 screens, 81 operations that change the record, 42 database tables, built over 286 development commits.

**The staff system — 65 working screens, five departments.** Each department gets its own menu, shaped around the job that desk actually does, and 58 of the 65 screens are locked to specific departments.

*Guangzhou* takes cargo in: registers consignments at the counter, photographs them, prints one QR sticker per physical box, builds the two loading tables for Guangzhou and Hong Kong flights, seals a batch, records the flight and dispatches it, and prints the manifest that travels with the cargo.

*Dar es Salaam* receives and hands over: the inbound dock, checking each box off the manifest as it comes off the truck, the release counter where a box is scanned and handed to the customer against a photo, the live view of what is standing in the warehouse, and the record of every handover ever made.

*Finance* bills and banks: invoices, the rate book and exchange rate, payments and receipts, expenses and approvals, company bank accounts, a general ledger with every movement and a running balance, and the pickup notes that authorise the warehouse to release cargo.

*Customer Care* answers the phone: tickets, the collections call list, sourcing requests, missing-cargo cases, and read-only access to everything about a consignment so they can answer any question without being able to change anything.

*The CEO* sees all of it, plus profit and loss by period and by flight, staff accounts, company settings, deleted records, and an audit log that even the owner cannot edit.

**Investigations and claims** run across all five departments — Dar reports a missing box, Guangzhou confirms whether it was loaded, Customer Care talks to the customer, Finance records a payout, the owner approves the amount.

**The customer-facing website — 18 pages, bilingual.** A marketing homepage with an animated route map; self-service tracking where a customer with no account types their tracking number and sees status, photos of their own goods taken in Guangzhou, a full timeline, what they owe in shillings, and the accounts to pay into; the Guangzhou warehouse address in Chinese for their supplier to read; a directory of 13 wholesale markets; a flight timetable that generates itself and never goes stale; eight import guides; and three forms — booking, supplier pickup, sourcing — that write real records into the staff queue with a reference number the customer quotes when they call.

Every QR sticker on every box links back to that tracking page. A customer scans the label on their own carton with a phone camera and sees their shipment, with no app and no login.

## 3. Where the real work is

Six things here are genuinely hard, and are exactly what a cheap build leaves out.

**The rate book has dates, and a settled invoice is never re-priced.** Rates are published as new entries; old invoices keep explaining themselves in the numbers the customer was actually quoted. The exchange rate is kept as history and frozen onto each invoice at the moment Finance signs off. *Prevents:* reprinting a six-month-old invoice and getting a different total than the customer was told, and re-pricing invoices retroactively every time the shilling moves.

**Confirming an invoice re-calculates it rather than ticking a box.** A draft raised the day cargo lands carries zero storage days. Confirm it three weeks later and a naive system bills three weeks of storage at zero. *Prevents:* the single largest quiet revenue leak in a business that charges for storage.

**Every physical box has its own identity, and the code cannot be guessed.** Tracking numbers run in sequence — knowing TX-000042 tells you TX-000043 exists. Since the code on the sticker is what the Dar counter scans before handing cargo over, a guessable identifier is a way to walk in and claim someone else's goods. *Prevents:* both cargo theft at the counter and the "we can't tell which carton this is" argument.

**Release requires four independent things to agree, at once.** A valid, unused pickup note exists; the scanned carton belongs to that exact shipment; no open physical investigation is holding the cargo; and every box on the consignment has been checked in. The handover photo is required by the system, not by the form. And the note is found *from* the scan, not chosen from a list — so the clerk cannot pick the wrong note and then scan to confirm their own mistake. *Prevents:* unpaid cargo leaving, partial consignments leaving, and cargo leaving while it is under investigation.

**The books are append-only and no balance is ever stored.** Every balance is worked out from the movements, every time. A wrong line is corrected by a visible reversing line, never by an edit. Payments are refused against draft or void invoices, refused if dated before the invoice existed, refused if they exceed the balance, and refused if the currency does not match the account. *Prevents:* a stored balance that is correct only until the first crash, and a ledger that can be quietly retyped.

**Duties are separated, and the separations are enforced, not requested.** Customer Care collects the customer's payment proof but can never say money arrived — Finance verifies, and nothing is released in between. Finance records a compensation payout but the owner approves the amount. The warehouse that lost the box does not decide what it was worth. Labels are printed in Guangzhou only, because a replacement sticker printed in Dar means two identities for one box. Permission is checked three times — in the menu, at the door, and inside the action itself — so a hidden button is never the only thing standing between someone and something they should not do. *Prevents:* the ordinary internal-fraud patterns, which in a cargo business are release-without-payment and inflated compensation claims.

Throughout, the safeguards carry notes naming the specific incident they exist to stop — a six-kilogram consignment in fifteen cartons billed as ninety kilograms, a shipment whose weight was corrected after it had already flown and been billed. That is hardening written after real events, not a template.

## 4. What it is comparable to

**Against off-the-shelf freight software:** the established platforms are built for freight forwarders in North America and Europe. They handle customs filings, container-level ocean freight, and carrier integrations this business does not use, and they do not handle what it does — a Guangzhou consolidation warehouse, three fixed flights a week, cash and mobile-money collection in shillings, a rate book that moves with the exchange rate, and a physical counter where cargo is handed over against a scan. Licensing runs per-user per-month indefinitely, configuration is a project of its own, and the parts that matter most here — the release gate, the per-box QR, the Swahili customer-facing site — would still need building on top. The honest comparison is that this is narrower than those platforms and better fitted; it does one route very well and does not pretend to be a global forwarding suite.

**Against a typical freelance build:** a freelancer quoting this as a shipment tracker would deliver a login, some forms, a list of shipments with a status dropdown, and a tracking page. It would work in a demo. What would be missing is everything in section three — dated rates, a real ledger, unguessable per-box identity, a release gate that refuses, separation of duties, an audit trail nobody can edit. Those are not features a client thinks to ask for; they are the things that turn out to matter the first time cargo goes missing or money is disputed, and by then they cannot be retrofitted cheaply because the record has already been kept the wrong way.

**What it honestly is not:** it does not send anything automatically. Customer messages are composed by the system in Swahili and English and sent by a staff member pressing send in WhatsApp — deliberate, because it means no messaging bill and no delivery failures, but it also means customer contact scales with headcount, not with software. Storage charges accrue correctly but nobody is chased automatically. The exchange rate and rate cards are maintained by hand, by design, and someone must own that. There is currently no error monitoring installed, and database structure changes are applied manually — both are small, known pieces of first-quarter work rather than design flaws.

**In scale:** roughly 80,000 lines across 364 files, 95 screens, 81 operations, 42 tables, 286 commits, and — worth stating plainly — zero paid third-party services beyond hosting, database and file storage. No payment processor, no SMS gateway, no email service, no external APIs. Running costs are hosting only, in the region of $50–120 a month at launch. Everything the system does, it does itself.