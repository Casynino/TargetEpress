/** Finance — the money desk. */

export default {
  brand: "Target Express Air Cargo",
  department: "Finance",
  shortName: "The money desk",
  title: "The money desk",
  route: ["Guangzhou", "Dar es Salaam"],
  lede:
    "Everything this business is owed passes through your screen, and no cargo leaves the Dar warehouse until you say it has been paid for. This is what to do when you sign in — in the order to do it.",

  authorities: {
    eyebrow: "Before anything else",
    title: "Two things only you can do",
    items: [
      {
        label: "Authority one",
        tone: "owed",
        title: "Say that money has actually arrived",
        body:
          "Customer Care can take a customer's word and upload their proof. They cannot mark it received. Until Finance agrees, the money does not exist as far as this system is concerned.",
      },
      {
        label: "Authority two",
        tone: "paid",
        title: "Free cargo from the warehouse",
        body:
          "The Dar counter cannot hand over boxes without a pickup note, and only Finance can issue one. When you issue it, cargo moves. When you do not, it stays.",
      },
    ],
  },

  canDo: [
    "Confirm prices and turn a draft into a real invoice",
    "Verify or reject payments claimed by Customer Care",
    "Record money paid straight to you, into a named account",
    "Issue and reprint pickup notes",
    "Record what the business spends, and move money between accounts",
    "Set the rate book that every quote in the system comes from",
  ],
  cannotDo: [
    "Release cargo yourself — you authorise it, the warehouse hands it over",
    "Edit an invoice once any money has landed against it",
    "Delete or edit anything in the audit trail, ever",
    "Register or receive cargo — that is the warehouses' work",
  ],

  map: {
    eyebrow: "The whole job on one page",
    title: "Your day, in six moves",
    stations: [
      { state: "draft", title: "Read Home", body: "The system has already written your to-do list. Start there." },
      { state: "draft", title: "Confirm the price", body: "Turn the system's draft figure into a bill the customer owes." },
      { state: "owed", title: "Verify payments", body: "Check what Customer Care says it collected, against the proof." },
      { state: "owed", title: "Record payments", body: "Money paid straight to you, always into a named account." },
      { state: "paid", title: "Issue the pickup note", body: "The warehouse's authority to hand the cargo over." },
      { state: "paid", title: "Chase the rest", body: "Work down Collections, oldest debt first." },
    ],
  },

  steps: [
    {
      n: 1,
      state: "draft",
      title: "Read what needs you",
      where: "Sign in → [Home] → Needs your attention",
      body: [
        "Your to-do list, written by the system rather than by you. Prices waiting to be confirmed, payments waiting to be checked, cargo that has sat too long. Start here every morning.",
        "*If this panel is empty, the desk is clear* — you do not need to go hunting through the other screens to be sure.",
      ],
      caution:
        "Finance sees the money, not the boxes. Your Home screen opens on *The money · right now*, while a warehouse hand signing in at the same moment sees cargo and no figures at all.",
      screen: {
        name: "Home — Habari, Aziza",
        blocks: [
          { type: "label", text: "The money · right now" },
          {
            type: "big",
            items: [
              { label: "Owed to us", value: "TSh 25,409,700", tone: "owed" },
              { label: "Collected today", value: "TSh 510,300", tone: "paid" },
            ],
          },
          { type: "rule" },
          { type: "label", text: "Needs your attention" },
          {
            type: "queue",
            items: [
              { text: "3 prices waiting to be confirmed", pill: { text: "Draft", tone: "draft" } },
              { text: "2 payments claimed by Customer Care", pill: { text: "Verify", tone: "owed" } },
              { text: "1 consignment held 21 days", pill: { text: "Chase", tone: "owed" } },
            ],
          },
        ],
      },
    },
    {
      n: 2,
      state: "draft",
      title: "Confirm the price",
      where: "[Batches] → open the batch → Confirm prices",
      body: [
        "When cargo lands in Dar the system prices it automatically and files it as a *draft*. A draft is a working figure — nobody has been asked for it and nobody owes it yet.",
        "Confirming is what turns it into a real bill. Use *Confirm all prices* to clear a whole batch at once.",
      ],
      caution:
        "Confirming *recalculates*. It counts the storage days up to today and freezes the exchange rate at that moment — so a bill confirmed three weeks late correctly charges three weeks of storage. *Never leave drafts sitting.*",
      screen: {
        name: "Batch B-2026-014 — Guangzhou → Dar",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Consignments", value: "18" },
              { label: "Priced, not confirmed", value: "3", tone: "draft" },
              { label: "Batch value", value: "USD 4,812.40" },
            ],
          },
          { type: "rule" },
          {
            type: "queue",
            items: [
              { text: "TX-000105 · 24.5 kg", value: "USD 39.15", pill: { text: "Draft", tone: "draft" } },
              { text: "TX-000106 · 8.0 kg", value: "USD 14.40", pill: { text: "Draft", tone: "draft" } },
            ],
          },
          { type: "actions", note: "Clears every draft in this batch", buttons: [{ text: "Confirm all prices", tone: "go" }] },
        ],
      },
    },
    {
      n: 3,
      state: "owed",
      title: "Verify what Customer Care collected",
      where: "[Finance] → Verify payments",
      quote:
        "Claims Customer Support has collected from customers. Nothing is settled and no cargo is released until you agree.",
      body: [
        "Open the claim, check the proof against the account the money should have landed in, then *Verify* or *Reject*. Rejecting sends it back with your reason; it does not delete anything.",
      ],
      caution:
        "Do not verify from the amount alone. *Match the proof to the account* — a screenshot showing the right figure paid into the wrong account is the most common way money goes missing.",
      screen: {
        name: "Finance — Verify payments",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Customer", value: "Japhet Lihanjala", sub: "TX-000105 · INV-2026-000002" },
              { label: "Claimed", value: "USD 39.15" },
            ],
          },
          { type: "rule" },
          {
            type: "kv",
            items: [
              { label: "Into account", value: "CRDB · Main" },
              { label: "Recorded by", value: "Customer Care" },
              { label: "Proof", value: "1 file" },
            ],
          },
          {
            type: "actions",
            note: "Nothing settles until you press this",
            buttons: [{ text: "Reject", tone: "ghost" }, { text: "Verify payment", tone: "go" }],
          },
        ],
      },
    },
    {
      n: 4,
      state: "owed",
      title: "Record money paid straight to you",
      where: "[Finance] → Payments from customers",
      body: [
        "Cash at the counter, a bank transfer, mobile money, a cheque — if it came to you rather than through Customer Care, record it here. A receipt is issued automatically.",
        "*Always name the account it landed in.* Every figure on the Accounts page is worked out from these entries, so an unnamed account is a figure that will never reconcile.",
      ],
      caution:
        "The system *refuses an overpayment* rather than quietly creating a credit nobody asked for, and refuses a payment dated before its invoice existed. If it says no, the numbers disagree — check them.",
      screen: {
        name: "Finance — Payments from customers",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Invoice", value: "INV-2026-000007" },
              { label: "Balance due", value: "USD 112.00", tone: "owed" },
            ],
          },
          { type: "rule" },
          {
            type: "kv",
            items: [
              { label: "Amount received", value: "USD 112.00" },
              { label: "Method", value: "Mobile money" },
              { label: "Into which account", value: "M-Pesa · Business" },
            ],
          },
          {
            type: "queue",
            items: [{ text: "Receipt RCT-2026-000041 issued", tone: "paid", pill: { text: "Paid in full", tone: "paid" } }],
          },
        ],
      },
    },
    {
      n: 5,
      state: "paid",
      title: "Issue the pickup note",
      where: "[Finance] → Pickup notes",
      quote:
        "The warehouse's authority to hand cargo over. Issued by Finance the moment a bill is settled — everyone else prints it and rings the customer.",
      body: [
        "This is the most important thing this desk does. Until the note exists, the Dar counter *physically cannot* release the boxes — it scans the carton and the screen refuses.",
      ],
      caution:
        "Issue it the moment an invoice settles. A customer standing at the counter with money already paid, waiting on a note nobody issued, is the one failure they will remember.",
      screen: {
        name: "Finance — Pickup notes",
        blocks: [
          {
            type: "queue",
            items: [
              {
                text: "PN-2026-000001",
                sub: "TX-000105 · Japhet Lihanjala · 3 packages",
                pill: { text: "Paid in full · Active", tone: "paid" },
              },
            ],
          },
          { type: "rule" },
          {
            type: "actions",
            note: "Print it, or send the customer the file",
            buttons: [{ text: "Download PDF", tone: "ghost" }, { text: "Print", tone: "" }],
          },
          {
            type: "queue",
            items: [{ text: "Dar warehouse can now scan and release", tone: "paid", pill: { text: "Cleared", tone: "paid" } }],
          },
        ],
      },
    },
    {
      n: 6,
      state: "paid",
      title: "Chase what is still owed",
      where: "[Collections]",
      body: [
        "Everything unpaid, oldest first, with a phone number beside it. Work down the list from the top — the oldest debt is the one least likely to ever be collected.",
        "What you and Customer Care have already collected shows here too, so *two people never ring the same customer twice* about the same box.",
      ],
      caution:
        "Cargo under investigation appears here as well. *Do not chase payment on a consignment the warehouse is still looking for* — check Issues & Claims first.",
      screen: {
        name: "Collections",
        blocks: [
          {
            type: "big",
            items: [
              { label: "Total outstanding", value: "TSh 25,409,700", tone: "owed" },
              { label: "Over 30 days", value: "TSh 3,120,000", tone: "signal" },
            ],
          },
          { type: "rule" },
          {
            type: "queue",
            items: [
              { text: "Grace Mwakalinga · +255 754 ···", sub: "TX-000098 · 34 days", value: "USD 208.00", tone: "signal" },
              { text: "Salum Rajabu · +255 712 ···", sub: "TX-000101 · 12 days", value: "USD 76.50", tone: "owed" },
            ],
          },
        ],
      },
    },
  ],

  guardrails: [
    {
      label: "Cargo",
      title: "Unpaid cargo cannot be released",
      body: "The counter checks the pickup note, the package, the investigation status and the carton count — all four, every single time.",
    },
    {
      label: "Invoices",
      title: "A paid invoice cannot be edited",
      body: "Once any money has landed against it, it is closed to changes. Correct it before the first payment, or raise the difference separately.",
    },
    {
      label: "Balances",
      title: "No balance is ever typed",
      body: "Every figure on Accounts is derived from recorded movements, so the books cannot quietly drift away from the record.",
    },
    {
      label: "The audit trail",
      title: "Nothing can be erased",
      body: "Every money action carries your name and the time. It is append-only — it cannot be edited or deleted by you, or by the CEO.",
    },
  ],
  guardrailNote:
    "*If one of these stops you, it has just prevented something expensive.* Do not look for a way around it — find out why the numbers disagree.",

  mistakes: [
    {
      mistake: "Leaving prices as drafts for weeks",
      consequence: "Storage days keep counting, so the customer is billed for a delay that was yours.",
      correct: "Confirm the batch the day it lands.",
    },
    {
      mistake: "Verifying a payment from the amount alone",
      consequence: "Money credited against an account it never reached; the books stop reconciling.",
      correct: "Open the proof and match the receiving account.",
    },
    {
      mistake: "Forgetting to issue the pickup note",
      consequence: "A customer who has paid is turned away at the counter.",
      correct: "Issue it the moment the invoice settles.",
    },
    {
      mistake: "Recording a payment without naming the account",
      consequence: "The Accounts page shows a figure no bank statement will ever match.",
      correct: "Always pick the receiving account.",
    },
    {
      mistake: "Chasing a customer whose cargo is under investigation",
      consequence: "You demand money for a box the warehouse cannot find.",
      correct: "Check Issues & Claims before ringing.",
    },
  ],

  menu: {
    eyebrow: "Tabs across the top of the General ledger screen",
    title: "The rest of your menu",
    rows: [
      { screen: "General ledger", answers: "What the business is holding, what is owed to it, and what has moved." },
      { screen: "Accounts", answers: "Where the company's money sits. Every figure derived from the ledger — nothing typed." },
      { screen: "The Ledger", answers: "Every movement of money, with its account, who recorded it, and a running balance." },
      { screen: "Expenses", answers: "What the business spends. Costs dated when incurred; the money dated when it left." },
      { screen: "Pricing & configuration", answers: "The rate book. Change a figure here and cargo, invoices, tracking and reports all follow." },
      { screen: "Audit", answers: "Every money action on the system, who did it and when. Append-only." },
      { screen: "Shipments · Batches", answers: "The cargo behind the money, for when a figure needs explaining." },
      { screen: "Issues & Claims", answers: "Cargo under investigation. Never settle a claim against a box still being looked for." },
    ],
  },

  closing: {
    title: "Three moves are the whole job",
    cards: [
      { title: "Confirm the price", body: "A draft owes nobody anything. Confirm it and the business is owed money." },
      { title: "Verify the payment", body: "Match the proof to the account. Until you agree, the money does not exist." },
      { title: "Issue the note", body: "The moment the bill is settled. Until it exists, the cargo cannot move." },
    ],
    line:
      "In that order, every day. Everything else on your menu is there to explain a number after somebody asks about it.",
  },
};
