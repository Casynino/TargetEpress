/** Guangzhou warehouse — where every record in the system is born. Role: CHINA_WAREHOUSE. */

export default {
  brand: "Target Express Air Cargo",
  department: "China Warehouse",
  shortName: "The Guangzhou floor",
  title: "The Guangzhou floor",
  route: ["The supplier", "The flight"],
  lede:
    "Every record in this system starts on your bench. You take the boxes in, weigh them, photograph them, register them, print the code that travels with them, and put them on a flight. Everything Dar, Finance and the customer ever see is what you typed — which is why this desk gets the most care.",

  authorities: {
    eyebrow: "Before anything else",
    title: "What this desk is, and what it is not",
    items: [
      {
        label: "You create it",
        tone: "owed",
        title: "The record everyone else works from",
        body:
          "Registering mints the tracking number, one QR-bearing label per box, the first line of history and the loading table it belongs on. *Nobody re-types this later.* Dar checks against it, Finance bills from it, the customer tracks it.",
      },
      {
        label: "You never see",
        tone: "signal",
        title: "What any of it costs",
        body:
          "No price, no invoice, no balance — not hidden on your screen, never sent to it at all. A rate box on the registration form would put pricing in the hands of whoever is holding the scale.",
      },
    ],
  },

  canDo: [
    "Register cargo, which creates the tracking number, the labels and the batch assignment",
    "Print the QR sticker — the only desk in the company that can",
    "Correct your own registration while the cargo is still in China",
    "Delete a duplicate you created, with a written reason; nothing is truly destroyed",
    "Open a loading table, move cargo on and off it, and seal it",
    "Dispatch a flight with its waybill, airline and departure date",
    "Read and edit the customer book",
    "Switch the whole interface between English and 中文 whenever you like",
  ],
  cannotDo: [
    "See money of any kind — prices are never fetched for your session",
    "Scan a box; the camera scanner belongs to Dar",
    "Receive or check in an arriving flight — that is Dar's bench",
    "Release cargo to a customer, or see who may collect",
    "Raise a claim — China does not flag cargo it has already handed to an airline",
    "Edit or delete cargo that has already left China",
  ],

  map: {
    eyebrow: "The whole job on one page",
    title: "Your day, in eight moves",
    stations: [
      { state: "draft", title: "Read the floor", body: "The attention panel is the morning's job list, already sorted." },
      { state: "draft", title: "Ring back the website", body: "Booking requests are not cargo until boxes are on the counter." },
      { state: "owed", title: "Weigh, photograph, register", body: "Five sections, in order. The scale first, always." },
      { state: "owed", title: "Print and stick, now", body: "One code per box. Never copy a label onto a second box." },
      { state: "owed", title: "Fix your own mistakes", body: "While it is still in China you can. After it flies you cannot." },
      { state: "owed", title: "Check the loading table", body: "Read the four tiles before anything is sealed." },
      { state: "paid", title: "Seal and dispatch", body: "Waybill and airline required. This cannot be undone." },
      { state: "paid", title: "Answer for what you loaded", body: "Nothing pushes cases to you. Go and look." },
    ],
  },

  steps: [
    {
      n: 1,
      state: "draft",
      title: "Sign in and read the floor",
      where: "Sign in → [Home]",
      body: [
        "Both clocks, today's cargo, weight and labels printed, then *Needs your attention* — which is your whole morning in one panel.",
        "*The language switch is in the sidebar, next to your name.* Press 中文 and the interface follows you; it is saved to you, not to the computer, so the bench machine and your phone agree.",
      ],
      caution:
        "*A consignment with no photograph is the urgent one.* It is registered but has nothing to argue with — if Dar says a box arrived damaged, there is no picture of what it looked like when it left you.",
      screen: {
        name: "Home — 广州 · the floor today",
        blocks: [
          {
            type: "big",
            items: [
              { label: "Cargo today", value: "23" },
              { label: "Weight today", value: "512 kg" },
            ],
          },
          { type: "rule" },
          { type: "label", text: "Needs your attention" },
          {
            type: "queue",
            items: [
              { text: "1 consignment with no photograph", pill: { text: "Urgent", tone: "signal" } },
              { text: "4 booking requests to ring back", pill: { text: "Call", tone: "owed" } },
              { text: "Table B-2026-015 ready to seal", pill: { text: "Dispatch", tone: "paid" } },
            ],
          },
        ],
      },
    },
    {
      n: 2,
      state: "draft",
      title: "Ring back what the website sent",
      where: "[Cargo] → Requests",
      body: [
        "Booking and pickup requests come in from the public site. Ring each person, agree what is happening, and move the status along as you go.",
      ],
      caution:
        "*A request is not a shipment and can never become one by itself.* Cargo is registered when the boxes are physically on your counter and somebody has weighed them — not when a customer fills in a form.",
    },
    {
      n: 3,
      state: "owed",
      title: "Weigh, photograph and register the cargo",
      where: "[Cargo] → Receive Cargo",
      body: [
        "Work the five sections in order. Find the customer in the book, or create one — *the phone number is the identity*. Pick the category, weigh, count the pieces, photograph, save.",
        "You may type the description in Chinese. The system keeps exactly what you typed *and* an English rendering beside it, so Dar reads English and you keep your own words.",
      ],
      caution:
        "*Weigh before you type* — a number typed from memory is a number the customer is billed on. At least one photograph is required by the server, not just by the form: the save is refused outright without one.",
      screen: {
        name: "收货登记 — Receive cargo",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "客户 Customer", value: "Japhet Lihanjala" },
              { label: "货物 Description", value: "手机配件", sub: "Mobile phone accessories" },
            ],
          },
          { type: "rule" },
          {
            type: "kv",
            items: [
              { label: "重量 Weight", value: "24.5 kg" },
              { label: "件数 Pieces", value: "3 cartons" },
              { label: "照片 Photos", value: "2", tone: "paid" },
            ],
          },
          { type: "actions", note: "Creates the tracking number and the labels", buttons: [{ text: "登记货物", tone: "go" }] },
        ],
      },
    },
    {
      n: 4,
      state: "owed",
      title: "Print the sticker and put it on the box now",
      where: "[Cargo] → the success screen → Print QR label",
      body: [
        "One sticker per physical package. Attach each to its own box before the boxes leave your bench.",
        "You are the only desk that can print these. Dar cannot make another one.",
      ],
      caution:
        "*One code per box — never copy a label onto two.* Two boxes wearing the same code is two boxes with one identity, and that is exactly how a piece goes missing with nobody able to say which one.",
    },
    {
      n: 5,
      state: "owed",
      title: "Fix your own mistakes while the cargo is still in China",
      where: "[Cargo] → open the consignment → Edit",
      body: [
        "Correct a mistyped weight, quantity, description, item or customer. If you registered the same boxes twice, delete the duplicate from the panel at the foot of the edit page and write why.",
        "A delete is not a destruction — the photographs and the history survive it.",
      ],
      caution:
        "*Both stop the moment the cargo flies.* After dispatch you get: “This cargo has already left China. Ask management to correct it.” Check your numbers while the boxes are still in front of you.",
    },
    {
      n: 6,
      state: "owed",
      title: "Check the loading table before it flies",
      where: "[Shipments] → Batches → open the table",
      body: [
        "Read the four tiles — cargo waiting, total weight, customers, oldest piece — and clear anything flagged as belonging on the other table.",
        "Assignment is automatic, so that warning should be impossible.",
      ],
      caution:
        "*If a misrouted warning does appear, something is genuinely wrong.* Check the cargo category before you dismiss it — the category is what decides which table a consignment belongs on.",
    },
    {
      n: 7,
      state: "paid",
      title: "Seal and dispatch onto the flight",
      where: "[Shipments] → Batches → Seal & dispatch",
      body: [
        "Enter the waybill number and airline — both required — plus the flight number, departure date and expected arrival.",
        "This moves every piece on the table onto the flight at once.",
      ],
      caution:
        "*There is no un-dispatch.* The screen says so plainly: this moves all the pieces onto the flight and cannot be undone. After it, you can no longer edit or delete any of that cargo. Read the table one more time first.",
      screen: {
        name: "Seal & dispatch — B-2026-015",
        blocks: [
          {
            type: "kv",
            items: [
              { label: "Pieces on the table", value: "18" },
              { label: "Total weight", value: "612 kg" },
              { label: "Oldest piece", value: "6 days" },
            ],
          },
          { type: "rule" },
          {
            type: "kv",
            items: [
              { label: "Waybill (required)", value: "176-44821905" },
              { label: "Airline (required)", value: "Ethiopian Airlines" },
              { label: "Departs", value: "2026-08-12" },
            ],
          },
          { type: "actions", note: "Cannot be undone", buttons: [{ text: "Seal & dispatch", tone: "go" }] },
        ],
      },
    },
    {
      n: 8,
      state: "paid",
      title: "Answer for what you loaded",
      where: "[Support] → Issues & Claims · [Record] → Reports",
      body: [
        "Check for cases raised against cargo you registered, and answer the one question you can answer better than anyone: *was it loaded in Guangzhou?* Your photographs, your weight and your carton count are the evidence.",
        "Then read your own numbers — registered, flown, still standing, and the photograph compliance ring.",
      ],
      caution:
        "*Nothing pushes these cases to you.* The notifications go to Customer Care, Finance and management. You have to open the page and look — make it part of the end of the day.",
    },
  ],

  guardrails: [
    {
      label: "Photographs",
      title: "At least one, always",
      body: "Enforced by the server, not the form. The photo is the only record of what a box looked like before it flew, and it is what protects you when a claim is raised.",
    },
    {
      label: "Labels",
      title: "One code per physical box",
      body: "Every package gets its own QR identity at registration. Copying a sticker onto a second box gives two boxes one identity — the single hardest problem to unpick later.",
    },
    {
      label: "Dispatch",
      title: "Sealing is final",
      body: "Once a table is dispatched, every piece on it is beyond editing or deleting from this desk. There is no undo, by design — the manifest Dar checks against must be the one that flew.",
    },
    {
      label: "Your own words",
      title: "Chinese is never overwritten",
      body: "What you type is kept exactly as you typed it, with an English rendering stored beside it. Dar reads English; you keep your own words on the record.",
    },
  ],
  guardrailNote:
    "*This desk creates the truth the whole company works from.* Nobody downstream can fix a weight that was guessed or a box that was never photographed — which is why the system insists here and nowhere else.",

  mistakes: [
    {
      mistake: "Typing a weight from memory",
      consequence: "The customer is billed on a number nobody measured.",
      correct: "Put it on the scale first, then type.",
    },
    {
      mistake: "Registering a booking request as cargo",
      consequence: "A tracking number exists for boxes nobody has seen.",
      correct: "Register when the boxes are on the counter.",
    },
    {
      mistake: "Copying one label onto two boxes",
      consequence: "Two boxes, one identity — and no way to tell which went missing.",
      correct: "Print one sticker per package.",
    },
    {
      mistake: "Leaving a consignment unphotographed",
      consequence: "A damage claim arrives and you have nothing to answer it with.",
      correct: "Photograph before the boxes leave the bench.",
    },
    {
      mistake: "Sealing a table without reading it",
      consequence: "Wrong cargo flies, and it cannot be undone.",
      correct: "Check the four tiles, then dispatch.",
    },
    {
      mistake: "Never opening Issues & Claims",
      consequence: "Cases about your cargo sit unanswered; nothing notifies you.",
      correct: "Check it at the end of every day.",
    },
  ],

  menu: {
    eyebrow: "The rest of your sidebar",
    title: "Where everything else lives",
    rows: [
      { screen: "Search 搜索", answers: "Any consignment, by tracking number, customer, phone or description." },
      { screen: "Requests 客户申请", answers: "Booking and pickup requests from the website, waiting on a call." },
      { screen: "Receive Cargo 收货登记", answers: "The registration bench. The screen you will use most." },
      { screen: "Batches 批次", answers: "The two loading tables, what is on them, and the seal & dispatch panel." },
      { screen: "Shipments 运单", answers: "Everything you have registered and where it has got to." },
      { screen: "Customers 客户", answers: "The customer book. The phone number is the identity." },
      { screen: "Issues & Claims 问题与索赔", answers: "Cases against cargo you loaded. Nothing pushes them to you." },
      { screen: "Reports 报表", answers: "Registered, flown, still standing, and photograph compliance. No money." },
    ],
  },

  closing: {
    title: "Three things carry this floor",
    cards: [
      { title: "Scale first, keyboard second", body: "Every figure downstream is the one you measured. Nobody checks it again." },
      { title: "One code, one box, photographed", body: "The label is the box's identity and the photo is its condition. Both, every time." },
      { title: "Read the table before you seal it", body: "Dispatch is the last moment anything can be corrected from this desk." },
    ],
    line:
      "You never see what any of it costs, and you never need to. Get the weight, the count and the picture right, and every desk after yours can do its job.",
  },
};
