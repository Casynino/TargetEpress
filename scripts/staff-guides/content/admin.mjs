/** Management — the chair that answers for all four desks. Role: ADMIN. */

export default {
  brand: "Target Express Air Cargo",
  department: "Management",
  shortName: "The CEO's chair",
  title: "The CEO's chair",
  route: ["Every desk", "One screen"],
  lede:
    "This is the one chair that answers for Guangzhou, the Dar floor, Finance and Customer Care at once. It exists to read the whole business on one screen and to sign off the decisions nobody else may take — not to run the daily operation. If you find yourself doing another desk's work, something upstream has gone wrong.",

  authorities: {
    eyebrow: "Before anything else",
    title: "You decide; other desks disburse",
    items: [
      {
        label: "Yours alone",
        tone: "owed",
        title: "The decisions with a cost attached",
        body:
          "Compensation payouts, costs above the threshold, staff and their access, the prices customers are told, and permanent deletion. No other role holds any of these — not even Finance.",
      },
      {
        label: "Deliberately split",
        tone: "paid",
        title: "Approving is never paying",
        body:
          "You approve a payout; Finance disburses it. You approve a cost; Finance's payment is what actually moves money. *One desk deciding and paying is how money leaves a business quietly.*",
      },
    ],
  },

  canDo: [
    "See every screen in the system — every desk, every figure, every record",
    "Approve compensation on a claim, and assign a case to a named person",
    "Approve any cost above the threshold before it can be paid",
    "Read the profit and loss — the one report withheld even from Finance",
    "Create staff, change roles, reset passwords and switch access off",
    "Restore a deleted consignment, or erase one permanently",
    "Change the collection accounts, offices and contact numbers customers see",
  ],
  cannotDo: [
    "Deactivate your own account — it would leave the company with no way back in",
    "Change your own role, for the same reason",
    "Edit or delete anything in the audit log, including your own actions",
    "Approve a payout twice, or on a case that is already finished",
    "Erase a record that still has an invoice, or that flew on a dispatched batch",
    "Erase anything without typing its tracking number exactly",
  ],

  map: {
    eyebrow: "The whole job on one page",
    title: "Your day, in eight moves",
    stations: [
      { state: "draft", title: "Land on the executive view", body: "A dashboard no other role sees." },
      { state: "draft", title: "Read what needs a decision", body: "Grouped by the desk that owns the fix, ranked by severity." },
      { state: "draft", title: "Scan every desk", body: "Four cards. Read the problem line, not the figure." },
      { state: "owed", title: "Clear the case decisions", body: "Compensation and assignment are yours alone." },
      { state: "owed", title: "Sign off the big costs", body: "Approving books no money. It only unlocks the payment." },
      { state: "owed", title: "Check the money position", body: "Cash available, then what the business actually earned." },
      { state: "paid", title: "Deal with anything deleted", body: "Restore it, or erase it for good — carefully." },
      { state: "paid", title: "People, prices and the log", body: "Change what is real, and settle arguments from the record." },
    ],
  },

  steps: [
    {
      n: 1,
      state: "draft",
      title: "Land on the executive view",
      where: "Sign in → [Home]",
      body: [
        "You land on a dashboard no other role sees: every desk at once, with the problems surfaced rather than the totals.",
      ],
      caution:
        "*The Receive cargo and Scan & release buttons on your banner are not your job.* They appear because you technically hold those permissions, not because you should be doing that work. Using them puts you in the middle of another desk's record.",
    },
    {
      n: 2,
      state: "draft",
      title: "Read what needs a decision",
      where: "[Home] → Needs your attention",
      body: [
        "One bounded, filterable panel, grouped by the desk that owns the fix — Guangzhou, Dar floor, Finance, Customer Care, Cases — and ranked critical, warning, info.",
        "*It never grows into an endless stack.* If it is long, filter it; do not scroll past things.",
      ],
      caution:
        "An empty panel says *“Nothing needs your decision. Every desk is clear.”* That is a real statement, worded deliberately differently from a panel that failed to load.",
      screen: {
        name: "Home — needs your decision",
        blocks: [
          {
            type: "queue",
            items: [
              { text: "Claim TX-000126 · payout awaiting approval", sub: "Cases", pill: { text: "Critical", tone: "signal" } },
              { text: "Warehouse rent · USD 1,200", sub: "Finance", pill: { text: "Approve", tone: "owed" } },
              { text: "3 consignments registered with no photograph", sub: "Guangzhou", pill: { text: "Warning", tone: "owed" } },
              { text: "5 past the free storage window", sub: "Dar floor", pill: { text: "Info", tone: "plain" } },
            ],
          },
        ],
      },
    },
    {
      n: 3,
      state: "draft",
      title: "Scan every desk",
      where: "[Home] → Every desk, right now",
      body: [
        "Four cards: Guangzhou (registered and waiting to fly, flagging anything unphotographed), the Dar floor (what is standing, flagging anything past the free storage window), Finance (bills unpaid and money waiting to be checked), and Customer Care (tickets and calls owed).",
      ],
      caution:
        "*Read the problem line, not just the figure.* A high number with no problem line underneath it is a busy desk working properly — not a desk in trouble.",
    },
    {
      n: 4,
      state: "owed",
      title: "Clear the case decisions",
      where: "[Support and issues] → Issues & Claims",
      body: [
        "Approve a payout, or assign a case to a named person. Both are yours alone — Customer Care and the warehouses can move a case along and gather evidence, but neither can decide it.",
        "Closing a case needs a resolution written down.",
      ],
      caution:
        "Approval is refused on a case that is already finished — *“This case is finished. Reopen it before approving a payout”* — and refused a second time on the same case. *You approve; Finance pays.* The two are deliberately different desks.",
      screen: {
        name: "Issues & Claims — TX-000126",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Case", value: "Missing · 1 carton" },
              { label: "Raised by", value: "Dar floor" },
              { label: "Claimed", value: "USD 180.00", tone: "owed" },
            ],
          },
          { type: "rule" },
          {
            type: "actions",
            note: "Finance disburses what you approve",
            buttons: [{ text: "Assign to someone", tone: "ghost" }, { text: "Approve payout", tone: "go" }],
          },
        ],
      },
    },
    {
      n: 5,
      state: "owed",
      title: "Sign off the big costs",
      where: "[Finance] → Expenses",
      body: [
        "Anything above the threshold waits for you. The page shows what is pending, what you have approved, and what has actually been paid.",
      ],
      caution:
        "*Approving books no money.* It only unlocks the cost for payment — the moment cash leaves an account is Finance's payment, recorded separately. Approving and paying are two desks on purpose.",
    },
    {
      n: 6,
      state: "owed",
      title: "Check the money position, then the profit",
      where: "[Finance] → General ledger → Reports",
      body: [
        "The headline is *cash available*, derived from the ledger and never typed, with the jobs underneath: prices to confirm, payments to check, bills unpaid.",
        "Then read the profit and loss — the one report withheld even from Finance. It shows two bases side by side: what the work earned, and what actually moved.",
      ],
      caution:
        "*The two bases always disagree, and both are true.* Quoting the cash figure as profit in a month with a big collection is how a bad month reads as a good one. Also: shillings lead, with the dollar figure underneath — never read one card in dollars against another in shillings.",
    },
    {
      n: 7,
      state: "paid",
      title: "Deal with anything deleted",
      where: "[Administration] → Deleted records",
      body: [
        "Every soft-deleted consignment, with the reason, who deleted it, and its photographs preserved. Restore it, or erase it permanently.",
        "*Nothing in this system is destroyed by an ordinary delete* — it is a timestamp, a person and a reason.",
      ],
      caution:
        "Permanent erasure refuses a record that is not already deleted, one with any invoice raised against it, and one that flew on a dispatched flight — and it demands you type the tracking number exactly. *Every one of those refusals is protecting the record, not obstructing you.*",
    },
    {
      n: 8,
      state: "paid",
      title: "People, prices and the log",
      where: "[Administration] → Staff · Company settings · [Record] → Audit log",
      body: [
        "Create accounts, change roles, reset passwords, switch access off. Change the collection accounts, offices and numbers customers see. Set the rate book.",
        "Then settle any argument from the audit log — every privileged action, searchable and filterable.",
      ],
      caution:
        "Saving an empty account list is refused outright: *an invoice with nowhere to pay is worse than no invoice.* Invoices already raised keep the accounts they were issued with. And the log is append-only *including for you* — if a mistake is in it, the fix is a new entry, never a correction.",
      screen: {
        name: "Audit log",
        blocks: [
          {
            type: "queue",
            items: [
              { text: "Payout approved · TX-000126", sub: "You · 14:22", value: "USD 180.00" },
              { text: "Role changed · Aziza → Finance", sub: "You · 11:05" },
              { text: "Collection account added · NMB", sub: "You · 09:41" },
            ],
          },
          { type: "rule" },
          { type: "label", text: "Append-only — nothing here can be edited or removed, including by you" },
        ],
      },
    },
  ],

  guardrails: [
    {
      label: "Separation",
      title: "Decide and disburse are never one desk",
      body: "You approve compensation; Finance pays it. You approve a cost; Finance's payment moves the money. Neither of you can do both halves.",
    },
    {
      label: "Lock-out",
      title: "You cannot shut yourself out",
      body: "Deactivating your own account or changing your own role is refused by name — there would be no way back into the company's own system.",
    },
    {
      label: "The record",
      title: "Append-only, including for you",
      body: "The audit log only ever gains rows. It is the only defence against “the number changed and nobody knows when”.",
    },
    {
      label: "Every door",
      title: "Checked twice, and self-sorting",
      body: "The route is checked before the page loads and again by the page itself, and the menu only ever offers doors the role can actually open.",
    },
  ],
  guardrailNote:
    "*These constraints exist because you are the one person nobody can overrule.* They are what make the record worth trusting when you are the one being asked to explain it.",

  mistakes: [
    {
      mistake: "Doing another desk's work from your banner",
      consequence: "Your name lands in the middle of a record that should be theirs.",
      correct: "Send it back to the desk that owns it.",
    },
    {
      mistake: "Reading the figure and not the problem line",
      consequence: "A busy, healthy desk looks like a crisis; a real one gets missed.",
      correct: "Read the line underneath the number.",
    },
    {
      mistake: "Quoting cash profit as profit",
      consequence: "A month with a big collection reads as a good month when the work lost money.",
      correct: "Read both bases and say which you mean.",
    },
    {
      mistake: "Comparing a shilling card with a dollar card",
      consequence: "A conclusion out by a factor of thousands.",
      correct: "Shillings lead; the dollar figure is what the invoice says.",
    },
    {
      mistake: "Treating approval as payment",
      consequence: "You believe money has left when it has not, or the reverse.",
      correct: "Approve, then confirm Finance actually paid it.",
    },
    {
      mistake: "Emptying the collection accounts to “tidy up”",
      consequence: "Refused — and if it were not, invoices would have nowhere to pay.",
      correct: "Add the new account before removing the old.",
    },
  ],

  menu: {
    eyebrow: "You can reach every screen in the system",
    title: "The ones only you can use",
    rows: [
      { screen: "Issues & Claims", answers: "Approving a payout and assigning a case. Yours alone." },
      { screen: "Expenses", answers: "Signing off costs above the threshold before they can be paid." },
      { screen: "Reports · Profit & loss", answers: "What the business earned, on both bases. Withheld even from Finance." },
      { screen: "Staff", answers: "Accounts, roles, passwords and access. You cannot alter your own." },
      { screen: "Deleted records", answers: "Restore a deletion, or erase it permanently under four conditions." },
      { screen: "Company settings", answers: "Collection accounts, offices and numbers — what customers are told." },
      { screen: "Price Configuration", answers: "The rate book every quote in the business comes from." },
      { screen: "Audit log", answers: "Every privileged action. Append-only, including for you." },
    ],
  },

  closing: {
    title: "Three things carry this chair",
    cards: [
      { title: "Decide, do not operate", body: "If you are registering cargo or releasing boxes, a desk below you needs attention instead." },
      { title: "Approving is not paying", body: "Your signature unlocks the money; Finance moves it. Confirm both halves happened." },
      { title: "Say which number you mean", body: "Two profit bases, two currencies. Most bad decisions here are a comparison, not a calculation." },
    ],
    line:
      "Every other desk is built so it cannot do your job. Keep it that way — the separations are what make the whole record worth trusting.",
  },
};
