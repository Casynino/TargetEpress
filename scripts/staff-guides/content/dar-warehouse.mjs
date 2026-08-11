/** Dar es Salaam warehouse — physical custody in Tanzania. Role: DAR_WAREHOUSE. */

export default {
  brand: "Target Express Air Cargo",
  department: "Dar es Salaam Warehouse",
  shortName: "The Dar floor",
  title: "The Dar floor",
  route: ["The flight lands", "The customer collects"],
  lede:
    "You take physical custody of everything this business flies. From the moment a flight lands until a customer walks out with their boxes, the cargo is yours. You never write the China record and you never touch money — you count, you hold, and you hand over against a note Finance issued.",

  authorities: {
    eyebrow: "Before anything else",
    title: "What this desk is, and what it is not",
    items: [
      {
        label: "Your word counts",
        tone: "owed",
        title: "What arrived, and in what condition",
        body:
          "Your check-in is the only comparison anyone will ever make between what Guangzhou declared and what actually landed. Nobody audits it afterwards. *If you tick a box clean, it is clean.*",
      },
      {
        label: "Not your call",
        tone: "signal",
        title: "Whether the cargo may leave",
        body:
          "That is answered by a pickup note Finance issued and by any open case on the cargo. You cannot see a price, issue a note, or override either. If there is no note, the answer is “check with Finance” — never a workaround.",
      },
    ],
  },

  canDo: [
    "Mark a landed flight as arrived, and check it in against China's manifest",
    "Rule on every consignment: received, missing, damaged, wrong item, wrong quantity, or hold",
    "See the photographs Guangzhou took before the cargo flew",
    "Scan a carton and release it to a customer against an active pickup note",
    "Open an investigation when a box is not on the shelf",
    "See what is on the floor and how long it has been standing",
  ],
  cannotDo: [
    "Register cargo — the China record is Guangzhou's, and stays Guangzhou's",
    "Print or reprint a cargo label; the sticker is made once, in Guangzhou",
    "See any price, invoice or amount paid — the figures are never sent to your screen",
    "Open, print, issue or cancel a pickup note — you scan it, Finance issues it",
    "Open, seal or dispatch a batch — you receive them, you do not fly them",
    "Approve a payout or a replacement on a claim — that is the CEO's",
  ],

  map: {
    eyebrow: "The whole job on one page",
    title: "Your day, in eight moves",
    stations: [
      { state: "draft", title: "Read the floor", body: "Three chips and one panel tell you the whole morning." },
      { state: "draft", title: "Land the flight", body: "Mark the batch arrived. From here it is yours to check in." },
      { state: "owed", title: "Print the manifest", body: "Check boxes against paper, not against a screen you are holding." },
      { state: "owed", title: "Rule on every line", body: "Six outcomes. Damaged needs a severity and a photograph." },
      { state: "owed", title: "Close the batch off", body: "It refuses while anything is still unruled. That is the point." },
      { state: "paid", title: "Pre-check the queue", body: "Read the blockers before a customer is standing in front of you." },
      { state: "paid", title: "Release the cargo", body: "Scan the carton. Photograph the handover. Both are enforced." },
      { state: "paid", title: "When a box is missing", body: "Never mark it delivered. Write down where you looked." },
    ],
  },

  steps: [
    {
      n: 1,
      state: "draft",
      title: "Sign in and read the floor",
      where: "Sign in → [Home]",
      body: [
        "Three chips across the banner — cargo in the warehouse, boxes on the floor, weight on the floor — and then *Needs your attention*, which is the morning's job list.",
        "You see cargo and time. You do not see money, anywhere, by design.",
      ],
      caution:
        "The boxes chip reads *“{n} short of the manifest”* when fewer cartons were ticked in than Guangzhou declared. *That number never fixes itself* — it is either a mis-scan or a genuinely missing box, and both need somebody to go and look.",
      screen: {
        name: "Home — the floor today",
        blocks: [
          {
            type: "big",
            items: [
              { label: "Cargo in the warehouse", value: "146" },
              { label: "Boxes on the floor", value: "389" },
            ],
          },
          { type: "rule" },
          { type: "label", text: "Needs your attention" },
          {
            type: "queue",
            items: [
              { text: "Batch B-2026-013 has landed", pill: { text: "Receive", tone: "owed" } },
              { text: "2 short of the manifest", pill: { text: "Count again", tone: "signal" } },
              { text: "7 ready for collection today", pill: { text: "Release", tone: "paid" } },
            ],
          },
        ],
      },
    },
    {
      n: 2,
      state: "draft",
      title: "Land the flight",
      where: "[Receiving Dock] → Mark as arrived",
      body: [
        "Find the batch that has landed and mark it arrived. That stamps the arrival date and hands the batch to you to check in.",
        "Only a batch actually in transit can be landed; anything else is refused.",
      ],
      caution: "",
    },
    {
      n: 3,
      state: "owed",
      title: "Print the manifest and open the bench",
      where: "[Receiving Dock] → open the batch → Manifest",
      body: [
        "*Print it.* Check physical boxes against paper — not against a screen you are also trying to hold while counting.",
        "Each row opens to show the photographs Guangzhou took, the declared weight and the declared carton count.",
      ],
      caution:
        "Those China photographs are the only picture of what the box looked like *before* it flew. If a consignment has none, check the label and the packing list harder before you tick it clean — you have nothing to argue with later.",
    },
    {
      n: 4,
      state: "owed",
      title: "Rule on every line",
      where: "[Receiving Dock] → open the batch",
      body: [
        "If the flight is intact, press *All present & undamaged* once. Otherwise rule on each row: received, missing, damaged, wrong item, wrong quantity, or hold for investigation.",
        "Anything other than received opens a case automatically, and the right people are told.",
      ],
      caution:
        "*Damaged demands a severity and a photograph* — this is the only moment that picture can be taken. Once the box is on the shelf, nobody can prove whether it arrived that way or was dropped here.",
      screen: {
        name: "Check in B-2026-013",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Declared", value: "42 cartons" },
              { label: "Ticked in", value: "40", tone: "signal" },
              { label: "Still unruled", value: "3", tone: "owed" },
            ],
          },
          { type: "rule" },
          {
            type: "queue",
            items: [
              { text: "TX-000121 · 6 cartons", pill: { text: "Received", tone: "paid" } },
              { text: "TX-000124 · 2 cartons", sub: "photo + severity required", pill: { text: "Damaged", tone: "signal" } },
              { text: "TX-000126 · 1 carton", pill: { text: "Missing", tone: "signal" } },
            ],
          },
        ],
      },
    },
    {
      n: 5,
      state: "owed",
      title: "Close the batch off",
      where: "[Receiving Dock] → finish check-in",
      body: [
        "Once every consignment on the batch has a ruling, finish the check-in. Only then is the flight closed.",
        "Cargo you check in is priced automatically the moment the check-in commits — which is what lets Finance start billing.",
      ],
      caution:
        "It refuses while anything is unruled: *“{n} shipment(s) still unchecked.”* That is not an obstacle — a customer cannot be invoiced until their cargo is checked in, so an unfinished batch is a customer nobody can bill.",
    },
    {
      n: 6,
      state: "paid",
      title: "Pre-check the queue before customers arrive",
      where: "[Pickup Queue]",
      body: [
        "Read the blockers on each row. They mirror, in the same order, the checks the release itself will run.",
        "Doing this before the counter opens is the difference between a two-minute handover and an argument.",
      ],
      caution:
        "A row can look perfectly paid and still be locked. *An open case holds the cargo whatever the money says* — a missing, damaged, wrong-item or quarantined box does not leave the building.",
    },
    {
      n: 7,
      state: "paid",
      title: "Release the cargo",
      where: "[Scan & release] → scan the QR on the carton",
      body: [
        "One scan. The screen opens with the customer, the cargo, whether it is paid, and the release form — everything on one page, nothing to go and fetch.",
        "Fill in who is collecting, their phone, what they are to the customer, and their ID. Then photograph the handover.",
      ],
      caution:
        "*Six things must agree* before a release goes through, all re-checked together: an active pickup note, the note matching this cargo, no open case, every package checked in, the carton count complete, and the handover photograph. *A partial shipment is never released* — four boxes out of five is how a claim starts.",
      screen: {
        name: "Scan & release — TX-000105",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Customer", value: "Japhet Lihanjala" },
              { label: "Packages", value: "3 of 3" },
              { label: "Payment", value: "Settled", tone: "paid" },
            ],
          },
          { type: "rule" },
          {
            type: "queue",
            items: [
              { text: "Pickup note PN-2026-000001", pill: { text: "Active", tone: "paid" } },
              { text: "No open cases", pill: { text: "Clear", tone: "paid" } },
              { text: "Handover photograph", pill: { text: "Required", tone: "signal" } },
            ],
          },
          { type: "actions", note: "Records who collected, and when", buttons: [{ text: "Complete handover", tone: "go" }] },
        ],
      },
    },
    {
      n: 8,
      state: "paid",
      title: "When the box is not on the shelf",
      where: "[Scan & release] → Unable to locate cargo",
      body: [
        "*Do not mark it delivered.* Press *Unable to locate cargo*, write where you looked, and confirm that you are stopping the pickup and opening an investigation.",
        "Management and Customer Care are told immediately, and the customer's public tracking updates on its own.",
      ],
      caution:
        "*“Where did you look?” is the only thing the person searching tomorrow has to go on.* “Not found” helps nobody, and the system refuses answers that short. Name the shelf, the bay and the batch you checked.",
    },
  ],

  guardrails: [
    {
      label: "Release",
      title: "Six checks, one transaction",
      body: "Note, cargo match, no open case, all packages in, full carton count, handover photo. They are re-checked together at the moment you press the button, not when the page loaded.",
    },
    {
      label: "Partial handovers",
      title: "All the boxes, or none",
      body: "The system will not let you hand over part of a consignment and sort it out later. That is precisely how a dispute becomes a claim.",
    },
    {
      label: "Open cases",
      title: "A case outranks the money",
      body: "Payment answers whether Finance cleared it. It does not answer whether the box may leave the building — an open case holds it either way.",
    },
    {
      label: "Photographs",
      title: "Enforced on the server, not the form",
      body: "Damage photos at check-in and the handover photo at release cannot be skipped by any route. They are what settle a dispute months later.",
    },
  ],
  guardrailNote:
    "*Every one of these protects you personally.* When a customer says a box was short or damaged, the record shows what you counted, what you photographed and who signed for it.",

  mistakes: [
    {
      mistake: "Ticking a whole flight clean without opening the rows",
      consequence: "A damaged box enters the warehouse as undamaged and becomes your problem.",
      correct: "Open each row against the printed manifest.",
    },
    {
      mistake: "Marking damage without the photograph",
      consequence: "The system refuses — and without it there is no proof it flew that way.",
      correct: "Photograph it on the bench, before it moves.",
    },
    {
      mistake: "Ignoring “short of the manifest”",
      consequence: "A missing box is discovered weeks later, when nobody can retrace it.",
      correct: "Recount the same day and open a case if it is real.",
    },
    {
      mistake: "Handing over part of a consignment",
      consequence: "Refused by the system, and the customer leaves believing they got everything.",
      correct: "Release all packages together, or none.",
    },
    {
      mistake: "Marking cargo delivered when it cannot be found",
      consequence: "The trail goes cold and the business carries the loss with no record.",
      correct: "Press Unable to locate and write where you looked.",
    },
    {
      mistake: "Arguing with a customer about their bill",
      consequence: "You have no figures on screen, so you cannot be right.",
      correct: "Send them to Finance; keep the counter moving.",
    },
  ],

  menu: {
    eyebrow: "The rest of your sidebar",
    title: "Where everything else lives",
    rows: [
      { screen: "Search", answers: "Any consignment, by tracking number, customer or phone." },
      { screen: "Scan & release", answers: "One scan takes you to everything you need to hand cargo over." },
      { screen: "Pickup Queue", answers: "Who may collect today, and what is blocking the rest." },
      { screen: "Receiving Dock", answers: "Flights to land, and the bench where you check them in." },
      { screen: "Available Cargo", answers: "What is on the floor now, and how long each piece has stood." },
      { screen: "Collected Cargo", answers: "Every handover, with the receiver, the relationship and the photo." },
      { screen: "Issues & Claims", answers: "Cases on your floor. Move them along; the CEO approves payouts." },
      { screen: "Reports", answers: "Throughput, how long each leg took, and who did the work." },
    ],
  },

  closing: {
    title: "Three things carry this floor",
    cards: [
      { title: "Count against paper", body: "Print the manifest and rule on every line. Your check-in is the only comparison anyone makes." },
      { title: "Photograph at the moment", body: "Damage on the bench, handover at the counter. Neither picture can be taken later." },
      { title: "Never guess at a missing box", body: "Open the investigation and write where you looked. Tomorrow's search has nothing else." },
    ],
    line:
      "You hold the cargo, not the money. That is why you can be completely straightforward with every customer at the counter — the figures are somebody else's to defend.",
  },
};
