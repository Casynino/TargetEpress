/** Customer Care — the desk that talks to customers. Role: CUSTOMER_CARE. */

export default {
  brand: "Target Express Air Cargo",
  department: "Customer Care",
  shortName: "The customer desk",
  title: "The customer desk",
  route: ["The customer", "The business"],
  lede:
    "You are the voice of this business. You answer where a customer's cargo is and what it costs, you chase what is owed, and you take their proof of payment upstairs. What you never do is decide that the money arrived — that is Finance, and the whole department is built around that one line.",

  authorities: {
    eyebrow: "Before anything else",
    title: "What this desk is, and what it is not",
    items: [
      {
        label: "You may say",
        tone: "owed",
        title: "“The customer says they have paid”",
        body:
          "You take the claim, attach their evidence, and hand it up to Finance. A submission moves no money: it writes nothing to the invoice, nothing to the ledger, nothing to any balance. *A claim is not money.*",
      },
      {
        label: "You may not say",
        tone: "signal",
        title: "“The money arrived”",
        body:
          "Only Finance can. That single denial is why this desk can ring customers all day without ever being able to release cargo or move a figure — and why nobody can pressure you into doing it.",
      },
    ],
  },

  canDo: [
    "See every consignment, its status and what the customer owes",
    "Bill a customer, edit an invoice and send it to them",
    "Chase what is owed, with a pre-written Swahili reminder on WhatsApp",
    "Take a payment claim with the customer's evidence attached",
    "Print a pickup note Finance has already issued",
    "Open, work and close tickets, sourcing requests and customer calls",
    "Quote from the rate book — the same one Finance bills from",
  ],
  cannotDo: [
    "Say that money arrived — you record a claim, Finance rules on it",
    "Verify your own submission, even in an emergency",
    "Issue or cancel a pickup note, so never promise cargo is released",
    "Give a discount, even while editing the same invoice",
    "Open the company's own books — accounts, ledger, costs, profit",
    "Touch the cargo: no registering, scanning, receiving or releasing",
  ],

  map: {
    eyebrow: "The whole job on one page",
    title: "Your day, in eight moves",
    stations: [
      { state: "draft", title: "Land on your desk", body: "You have no separate dashboard. /app/support is it." },
      { state: "draft", title: "Read what needs you", body: "One panel, already sorted by urgency. Work it top to bottom." },
      { state: "owed", title: "Clear the rejections first", body: "Anything Finance sent back is a customer waiting on you." },
      { state: "owed", title: "Work the call list", body: "Read the Next action column before you dial." },
      { state: "owed", title: "Ring or message them", body: "The Swahili reminder is already written. Quote the row." },
      { state: "owed", title: "Take their proof", body: "A reference on its own is not evidence. Attach the file." },
      { state: "paid", title: "Tell them to collect", body: "Only once the pickup note actually exists." },
      { state: "paid", title: "Work tickets and sourcing", body: "Every call becomes a record somebody else can pick up." },
    ],
  },

  steps: [
    {
      n: 1,
      state: "draft",
      title: "Land on your desk",
      where: "Sign in → you arrive at [/app/support]",
      body: [
        "Everyone signs in to the same door, and the system sends you straight here. *This page is your dashboard* — there is no second one to go looking for.",
        "If you bookmarked a dashboard from another role it still works; it simply redirects back here.",
      ],
      caution: "",
      screen: {
        name: "Customer Care — your desk",
        blocks: [
          { type: "label", text: "Needs your attention" },
          {
            type: "queue",
            items: [
              { text: "2 urgent tickets", pill: { text: "Urgent", tone: "signal" } },
              { text: "9 customers to chase", pill: { text: "Call", tone: "owed" } },
              { text: "1 payment Finance sent back", pill: { text: "Rejected", tone: "signal" } },
              { text: "3 claims still with Finance", pill: { text: "Waiting", tone: "plain" } },
            ],
          },
        ],
      },
    },
    {
      n: 2,
      state: "draft",
      title: "Read what needs you, top to bottom",
      where: "[/app/support] → Needs your attention",
      body: [
        "One fixed panel that builds itself from live counts, already in order of urgency: urgent tickets, customers to chase, payments Finance sent back, claims still waiting, cases parked on a customer.",
        "*Work it in the order it gives you.* It is sorted by how much the business loses if you do not.",
      ],
      caution:
        "When it is empty it says so — *“Nothing is waiting on you. Every landed consignment is billed and no customer is owed a call.”* That is a real state, not a screen that failed to load.",
    },
    {
      n: 3,
      state: "owed",
      title: "Clear what Finance sent back — first",
      where: "[Collections] → Submissions → Rejected",
      body: [
        "A rejection means a customer believes they have paid and the business disagrees. Nothing is more urgent than that.",
        "Open each one, read the reason Finance had to write, ring the customer, and take a corrected claim.",
      ],
      caution:
        "*Nothing is deleted on a rejection.* The claim, the refusal and the customer's original evidence all stay on the record. Do not open a fresh claim to bury an old one — raise the corrected one against the same bill.",
      screen: {
        name: "Collections — Submissions · Rejected",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Customer", value: "Neema Kileo", sub: "TX-000112 · INV-2026-000019" },
              { label: "Claimed", value: "USD 84.00", tone: "signal" },
            ],
          },
          { type: "rule" },
          { type: "label", text: "Why Finance sent it back" },
          {
            type: "queue",
            items: [{ text: "Proof shows a different account. Ask for the CRDB slip.", tone: "signal" }],
          },
        ],
      },
    },
    {
      n: 4,
      state: "owed",
      title: "Work the call list",
      where: "[Collections] → The call list",
      body: [
        "Every consignment sitting in Dar that is already billed and not yet paid, with a phone number on the row.",
        "*Read the “Next action” column before you dial.* A row that says “Confirm the price” means the invoice is still a draft — the business has not agreed that figure yet.",
      ],
      caution:
        "*Never quote a draft.* A draft is the system's price, not a bill. Asking a customer for a figure this business has not yet agreed to is how a quote becomes an argument.",
      screen: {
        name: "Collections — The call list",
        blocks: [
          {
            type: "queue",
            items: [
              {
                text: "Grace Mwakalinga · +255 754 ···",
                sub: "TX-000098 · 34 days · Next action: Ring them",
                value: "USD 208.00",
                tone: "signal",
              },
              {
                text: "Salum Rajabu · +255 712 ···",
                sub: "TX-000101 · Next action: Confirm the price",
                value: "Draft",
                tone: "draft",
              },
            ],
          },
        ],
      },
    },
    {
      n: 5,
      state: "owed",
      title: "Ring or message them",
      where: "[Collections] → The call list → the WhatsApp icon",
      body: [
        "The Swahili reminder is already composed for you: the customer's name, tracking number, goods, invoice number, weight, the amount in shillings and where to pay.",
        "*Quote the row, never the band total at the top.* The band converts at today's live rate and is an estimate; the row is the exact figure the customer was quoted.",
      ],
      caution:
        "Every call you make should end up written down. A conversation nobody logged is a conversation the next person on this desk has to have all over again.",
    },
    {
      n: 6,
      state: "owed",
      title: "Take their proof and hand it up",
      where: "[Collections] → Record their payment",
      body: [
        "When a customer says they have paid, open the payment icon on their row. Everything except the reference and the attachment is filled in for you.",
        "*You must attach evidence.* Finance cannot verify a reference on its own.",
      ],
      caution:
        "An iPhone HEIC photo is refused with instructions, because Finance must be able to open it. Ask for a screenshot, or have them set Camera → Formats to *Most Compatible*. One pending claim per bill — a second is refused by name.",
      screen: {
        name: "Collections — Record their payment",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Invoice", value: "INV-2026-000021" },
              { label: "Amount claimed", value: "USD 64.00" },
              { label: "Method", value: "M-Pesa" },
            ],
          },
          { type: "rule" },
          {
            type: "queue",
            items: [
              { text: "Reference number", value: "SFT4K29LMQ", tone: "plain" },
              { text: "Evidence attached", value: "receipt.jpg", pill: { text: "Required", tone: "signal" } },
            ],
          },
          { type: "actions", note: "Goes to Finance to be checked", buttons: [{ text: "Hand up to Finance", tone: "go" }] },
        ],
      },
    },
    {
      n: 7,
      state: "paid",
      title: "Tell them to collect — once it clears",
      where: "[Collections] → Ready for pickup",
      body: [
        "When Finance verifies, the payment is recorded, a receipt is numbered, the ledger is posted and — if the bill is settled — the pickup note is minted and the cargo flips to ready for pickup.",
        "You can read, print and search notes. *You cannot issue one.*",
      ],
      caution:
        "*Do not tell a customer their cargo is released until the note actually exists.* A customer sent to the warehouse too early is turned away at the counter, and it is your name they remember.",
    },
    {
      n: 8,
      state: "paid",
      title: "Work the tickets and the sourcing board",
      where: "[Tickets] · [Sourcing requests] · [Issues & Claims]",
      body: [
        "Take calls, complaints and price enquiries as tickets. A customer link is optional — price enquiries arrive before people are customers — but a name or a phone number is required.",
        "Move sourcing requests left to right: New → In progress → Waiting for customer → Supplier found → Completed.",
      ],
      caution:
        "You cannot close a ticket without writing what you did, and you cannot mark a sourcing request found or completed without recording what you found. *Internal notes are never shown to the customer* — write freely.",
    },
  ],

  guardrails: [
    {
      label: "Money",
      title: "A claim is not money",
      body: "Your submission writes nothing to the invoice, the ledger or any balance. Only Finance's verification moves a figure — which is why nobody can lean on you to make cargo move.",
    },
    {
      label: "Drafts",
      title: "You cannot collect against a draft",
      body: "A draft is the system's price, not a bill. Confirming is Finance's job; until they do, there is no figure to ask a customer for.",
    },
    {
      label: "Duplicates",
      title: "One pending claim per invoice",
      body: "A second submission on the same bill is refused by name. Two claims is two people ringing the same customer and Finance checking the same money twice.",
    },
    {
      label: "Every door",
      title: "Checked twice, always",
      body: "The route is checked before the page loads and every action re-checks before it writes. A button you should not see is not drawn — and would still refuse if it were.",
    },
  ],
  guardrailNote:
    "*None of this is aimed at you.* It is what lets one desk hold the customer relationship and the billing without ever being able to move the money — which protects you as much as it protects the business.",

  mistakes: [
    {
      mistake: "Quoting the band total at the top of the page",
      consequence: "You quote a live estimate; the customer pays a different figure and disputes it.",
      correct: "Quote the amount on the customer's own row.",
    },
    {
      mistake: "Quoting a price that is still a draft",
      consequence: "You ask for a figure the business has not agreed. It may change.",
      correct: "Wait for Finance to confirm the price.",
    },
    {
      mistake: "Recording a claim with only a reference number",
      consequence: "Finance cannot verify it and sends it back; the customer waits another day.",
      correct: "Always attach the screenshot or slip.",
    },
    {
      mistake: "Opening a second claim when the first was rejected",
      consequence: "Two claims on one bill; the system refuses it and the record looks like a cover-up.",
      correct: "Correct the claim against the same invoice.",
    },
    {
      mistake: "Telling a customer to collect before the note exists",
      consequence: "They travel to the warehouse and are turned away.",
      correct: "Wait until the cargo shows ready for pickup.",
    },
    {
      mistake: "Closing a ticket with no resolution written",
      consequence: "The system refuses it — and the next person has no idea what happened.",
      correct: "Write what you actually did.",
    },
  ],

  menu: {
    eyebrow: "The rest of your sidebar",
    title: "Where everything else lives",
    rows: [
      { screen: "Search", answers: "Any consignment, by tracking number, customer, phone or description." },
      { screen: "Customers", answers: "The customer book — history, contact details and everything they have shipped." },
      { screen: "Shipments · Batches", answers: "Where a consignment is, and which flight it came on." },
      { screen: "Collections", answers: "What is owed, who to ring, what you have handed up and what came back." },
      { screen: "Pickup notes", answers: "Notes Finance has issued. You print them; you do not create them." },
      { screen: "Price Configuration", answers: "The rate book. Read a quote off this, never from memory." },
      { screen: "Tickets", answers: "Calls, complaints and enquiries, with the resolution written down." },
      { screen: "Issues & Claims", answers: "Cargo under investigation. Ring the ones parked on the customer." },
      { screen: "Sourcing requests", answers: "Customers asking us to find goods in China, on a board." },
      { screen: "China markets", answers: "Which Guangzhou market sells what, so you can point them properly." },
    ],
  },

  closing: {
    title: "Three things carry this desk",
    cards: [
      { title: "Work the panel in its order", body: "It is already sorted by what costs the business most. Do not pick by eye." },
      { title: "Never quote what is not agreed", body: "Not a draft, not a band total. Quote the customer's own row." },
      { title: "Take the proof, not the promise", body: "A reference on its own comes straight back. Attach the file the first time." },
    ],
    line:
      "You hold the relationship; Finance holds the money. Keeping those apart is what lets you be completely straight with a customer about everything except whether their payment has landed.",
  },
};
