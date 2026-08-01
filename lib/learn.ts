/**
 * The guides.
 *
 * Written from what the desk gets asked on WhatsApp every week, not from what
 * reads well in a brochure. A first-time importer's real questions are boring
 * and specific — how do I pay a supplier who wants a bank transfer, why did my
 * 30 kg cost more than my friend's 30 kg, what happens if the box is opened at
 * customs — and answering those honestly is what makes a freight company look
 * like it knows the route.
 *
 * Kept in code rather than a CMS. There are eight of them, they change twice a
 * year, and a database table would mean an editor screen nobody would use.
 */

export type Article = {
  slug: string;
  title: string;
  summary: string;
  readMinutes: number;
  category: "Getting started" | "Shipping" | "Buying in China" | "Money";
  /** Rendered in order. Prose paragraphs, headed sections and lists. */
  body: (
    | { kind: "p"; text: string }
    | { kind: "h"; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "note"; text: string }
  )[];
};

export const ARTICLES: Article[] = [
  {
    slug: "how-air-cargo-works",
    title: "How air cargo from China actually works",
    summary:
      "From your supplier's shop to the counter in Dar es Salaam — the eight steps your boxes go through, and who is responsible at each one.",
    readMinutes: 5,
    category: "Getting started",
    body: [
      {
        kind: "p",
        text: "Most people importing for the first time picture one long journey: goods leave China, goods arrive in Tanzania. In practice your cargo changes hands several times, and knowing where those handovers are is what lets you tell a delay from a disaster.",
      },
      { kind: "h", text: "1. Your supplier delivers to our warehouse" },
      {
        kind: "p",
        text: "You give your supplier our Guangzhou address with your name written on it. That name is the only thing connecting the boxes to you, so it matters more than anything else on the label. A carton that arrives with no name is a carton nobody can find.",
      },
      { kind: "h", text: "2. We receive, weigh and photograph it" },
      {
        kind: "p",
        text: "The same day it arrives we put it on the scale, photograph it as it came in, and give it a tracking number. That photograph is your evidence if anything is damaged later — it is the record of what condition the goods were in before we touched them.",
      },
      { kind: "h", text: "3. It joins a loading table" },
      {
        kind: "p",
        text: "Normal goods go on the Guangzhou table; electronics and liquids go on the Hong Kong one, because those need a different airport and different paperwork. You do not choose this — the type of goods does.",
      },
      { kind: "h", text: "4. The batch is sealed and flown" },
      {
        kind: "p",
        text: "We fly Wednesday, Friday and Sunday. When a table is sealed it gets a waybill number and a flight, and every piece on it moves to In Transit at once.",
      },
      { kind: "h", text: "5. It lands and is checked against the manifest" },
      {
        kind: "p",
        text: "In Dar the whole batch is checked piece by piece against a printed list. Anything missing is flagged there and then, not discovered three weeks later when somebody comes to collect.",
      },
      { kind: "h", text: "6. Customs" },
      {
        kind: "p",
        text: "Cargo clears as part of the consignment. This is the step with the least predictable timing — a batch can clear in a day or sit for several.",
      },
      { kind: "h", text: "7. You are invoiced" },
      {
        kind: "p",
        text: "Once the cargo is checked in, the charge is calculated on our scale weight and the rate for your goods. Not on the weight your supplier told you.",
      },
      { kind: "h", text: "8. You pay and collect" },
      {
        kind: "p",
        text: "Bring the tracking number. We scan the code on your box, confirm the payment, photograph the handover, and it is yours.",
      },
      {
        kind: "note",
        text: "The two steps you can influence are the first and the seventh. Get your name on the boxes, and tell us what is inside so it is priced on the right rate.",
      },
    ],
  },
  {
    slug: "why-weight-is-charged",
    title: "Why your 30 kg cost more than someone else's 30 kg",
    summary:
      "Air freight is not priced by weight alone. Understanding chargeable weight and per-piece rates saves arguments at the counter.",
    readMinutes: 4,
    category: "Money",
    body: [
      {
        kind: "p",
        text: "Two customers bring 30 kilograms and get two different bills. Nothing has gone wrong — they were carrying different things.",
      },
      { kind: "h", text: "Goods are priced by what they are" },
      {
        kind: "p",
        text: "Clothes, shoes, phone accessories and car parts all sit on different rates, because they take different amounts of space, carry different customs risk, and some need a different airport entirely. Thirty kilos of fabric and thirty kilos of laptops are not the same cargo to an airline.",
      },
      { kind: "h", text: "Some things are priced per piece" },
      {
        kind: "p",
        text: "A phone, a laptop, a camera — these are charged per unit rather than per kilogram. A laptop weighs almost nothing and is worth a great deal; pricing it by weight would be pricing the box it came in.",
      },
      { kind: "h", text: "Light and bulky costs more than heavy and dense" },
      {
        kind: "p",
        text: "An aircraft runs out of space long before it runs out of lift. A sack of cushions weighing 5 kg takes the room of 40 kg of hardware, and the price reflects the room, not the scale.",
      },
      {
        kind: "note",
        text: "This is why we ask what is inside. Tell us it is clothes and it is priced as clothes. Say nothing and it is priced on the general rate, which is almost always more expensive than the right one.",
      },
      { kind: "h", text: "What you can do about it" },
      {
        kind: "list",
        items: [
          "Ask your supplier to pack tightly. Air, in a carton, is something you pay to fly.",
          "Consolidate. Three small orders arriving separately are three shipments; arriving together they are one.",
          "Tell us the goods type accurately — under-declaring to get a cheaper rate is what gets a consignment held at customs.",
          "Ask us what your goods will cost before you buy, not after.",
        ],
      },
    ],
  },
  {
    slug: "choosing-a-supplier",
    title: "How to choose a supplier in China without being cheated",
    summary:
      "The checks that separate a factory from a middleman, and the three warning signs worth walking away from.",
    readMinutes: 6,
    category: "Buying in China",
    body: [
      {
        kind: "p",
        text: "Almost everyone importing from China gets a bad order at some point. The difference between people who keep importing and people who stop is usually not luck — it is a handful of checks made before any money moved.",
      },
      { kind: "h", text: "Know whether you are talking to a factory or a trader" },
      {
        kind: "p",
        text: "Neither is bad. A trader can be genuinely useful for small orders across several products. But you should know which you are dealing with, because a trader quoting factory prices is quoting somebody else's prices and will make the difference back somewhere you cannot see.",
      },
      {
        kind: "p",
        text: "Ask what else they make. A factory makes a narrow range extremely well. A trader will offer you shoes, kettles and phone cases from the same catalogue.",
      },
      { kind: "h", text: "Always buy a sample first" },
      {
        kind: "p",
        text: "A sample costs a fraction of an order and tells you what photographs cannot: the weight of the fabric, the smell of the plastic, whether the stitching survives being pulled. If a supplier will not send one, that is your answer.",
      },
      { kind: "h", text: "Three warning signs" },
      {
        kind: "list",
        items: [
          "A price far below everyone else. In a market as competitive as Guangzhou, a price nobody else can match usually means goods nobody else would sell.",
          "Pressure to pay to a personal account rather than a company one. Payment outside the platform is payment with no recourse.",
          "Answers that do not match the question. Ask about material composition; if you get pictures back, ask again.",
        ],
      },
      { kind: "h", text: "Have someone look before it ships" },
      {
        kind: "p",
        text: "We inspect cargo at our Guangzhou warehouse and photograph it. It is far cheaper to reject something in China than to discover it in Dar es Salaam, where your options are to accept it or to have paid freight on goods you cannot sell.",
      },
    ],
  },
  {
    slug: "packing-for-air-freight",
    title: "Packing so your goods survive the flight",
    summary:
      "Cargo is stacked, strapped and moved by machine. What that means for how your supplier should pack.",
    readMinutes: 4,
    category: "Shipping",
    body: [
      {
        kind: "p",
        text: "Your cartons will be stacked under other cartons, strapped to a pallet, driven across an apron and loaded by machine. Packing for that is different from packing for a courier.",
      },
      { kind: "h", text: "Boxes, not bags, wherever possible" },
      {
        kind: "p",
        text: "A woven sack is cheap and it protects nothing. It tears on a corner, it cannot be stacked, and everything inside takes the shape of whatever is on top of it. Ask for double-walled cartons on anything fragile.",
      },
      { kind: "h", text: "Fill the empty space" },
      {
        kind: "p",
        text: "A half-full carton collapses under weight. Either fill it or ask for a smaller box — and remember you are paying to fly whatever room the box takes.",
      },
      { kind: "h", text: "Your name on every piece" },
      {
        kind: "p",
        text: "Not on one carton of six. On all six. Cartons get separated on a pallet, and the one without a name is the one that ends up in the corner of a warehouse.",
      },
      { kind: "h", text: "Liquids and powders need declaring" },
      {
        kind: "p",
        text: "Perfume, oils, creams, batteries and anything with a lithium cell fly under different rules and from a different airport. Not declaring them does not get them through — it gets the whole consignment held, including everybody else's cargo on that flight.",
      },
      {
        kind: "note",
        text: "If you are unsure whether something counts as a liquid or a battery, ask us before it ships. It costs one WhatsApp message and can save the flight.",
      },
    ],
  },
  {
    slug: "paying-suppliers",
    title: "Paying a Chinese supplier from Tanzania",
    summary:
      "The realistic options, what each costs you, and the one rule that protects your money.",
    readMinutes: 5,
    category: "Money",
    body: [
      {
        kind: "p",
        text: "Getting money from Tanzania to a supplier in Guangzhou is often harder than getting the goods back. These are the routes people actually use.",
      },
      { kind: "h", text: "Bank transfer" },
      {
        kind: "p",
        text: "Slow, traceable and fine for larger orders with an established supplier. Expect fees at both ends and a few days. Ask for the company account, in the company name — a personal account is a favour you are doing them at your own risk.",
      },
      { kind: "h", text: "Through us" },
      {
        kind: "p",
        text: "We buy on behalf of customers regularly. You pay us here, we pay the supplier there, and the goods come to our own warehouse. It removes the transfer problem and means somebody local is inspecting what arrives.",
      },
      { kind: "h", text: "The rule that matters" },
      {
        kind: "p",
        text: "Never pay the full amount before you have seen a sample or a photograph of the finished order. A deposit is normal, and the balance on completion is normal. Paying everything in advance to a supplier you have not bought from before is how most import stories go wrong.",
      },
      {
        kind: "note",
        text: "Keep every message where a price, a quantity or a specification was agreed. A screenshot has settled more disputes than any contract.",
      },
    ],
  },
  {
    slug: "customs-and-clearing",
    title: "What customs actually does with your cargo",
    summary:
      "Why clearance timing is unpredictable, what gets inspected, and how to avoid becoming the reason a batch is held.",
    readMinutes: 4,
    category: "Shipping",
    body: [
      {
        kind: "p",
        text: "Customs is the part of the journey nobody can promise a time for, and the part where mistakes made in China become expensive in Tanzania.",
      },
      { kind: "h", text: "The consignment clears, not your box" },
      {
        kind: "p",
        text: "Your cargo travels as part of a batch, and the batch clears together. One badly declared shipment can hold up everything on that flight — which is why we ask what is inside, and why declaring accurately matters to everyone, not only to you.",
      },
      { kind: "h", text: "What draws attention" },
      {
        kind: "list",
        items: [
          "Goods that do not match the declaration.",
          "Branded items — anything carrying a logo invites questions about authenticity.",
          "Medicines, cosmetics and food, which need their own approvals.",
          "Batteries and anything pressurised.",
        ],
      },
      { kind: "h", text: "What you should do" },
      {
        kind: "p",
        text: "Tell us accurately what you are importing before it flies. If it needs a permit, it is far better to know while the cargo is still in Guangzhou than after it has landed and is accruing storage.",
      },
    ],
  },
  {
    slug: "first-import-checklist",
    title: "Your first import: a checklist",
    summary:
      "Everything to do in order, from choosing a product to collecting the boxes — with the mistakes first-timers make at each step.",
    readMinutes: 6,
    category: "Getting started",
    body: [
      {
        kind: "p",
        text: "If you have never imported before, this is the whole process in order. It is shorter than it looks.",
      },
      { kind: "h", text: "Before you buy" },
      {
        kind: "list",
        items: [
          "Work out what a competitor sells the same item for in Dar. If freight plus purchase price is close to that, the order does not work — find out now.",
          "Ask us for a quote on WhatsApp before you buy — we will tell you the rate for your goods.",
          "Ask us whether your goods are normal, electronics or special. It changes both the price and the airport.",
        ],
      },
      { kind: "h", text: "Ordering" },
      {
        kind: "list",
        items: [
          "Buy a sample first, always.",
          "Agree the total weight and carton count in writing before payment.",
          "Give the supplier our Guangzhou address with your name on it.",
          "Tell us it is coming, so we know to expect it in your name.",
        ],
      },
      { kind: "h", text: "While it ships" },
      {
        kind: "list",
        items: [
          "Check your tracking number the day we receive it — the photos show you what actually arrived.",
          "If the weight surprises you, ask immediately. It is easier to resolve while the cargo is still in China.",
        ],
      },
      { kind: "h", text: "Collecting" },
      {
        kind: "list",
        items: [
          "Settle the invoice before travelling to the office; cargo is released against a paid pickup note.",
          "Bring the tracking number.",
          "Count your pieces at the counter, not at home.",
        ],
      },
      {
        kind: "note",
        text: "The single most common first-timer mistake: no name on the cartons. The second: not saying what is inside, and being billed on the general rate.",
      },
    ],
  },
  {
    slug: "consolidation",
    title: "Buying from several suppliers and shipping once",
    summary:
      "How consolidation works, when it saves money, and when it costs you more than shipping separately.",
    readMinutes: 3,
    category: "Shipping",
    body: [
      {
        kind: "p",
        text: "Consolidation means several orders from different suppliers arriving at our warehouse and leaving as one shipment. It is one of the more useful things a freight company does, and it is not always the right answer.",
      },
      { kind: "h", text: "When it helps" },
      {
        kind: "list",
        items: [
          "You are buying small quantities from several markets — clothes from Baima, accessories from Huaqiangbei, shoes from Zhanxi.",
          "Your orders are ready at different times but none is urgent.",
          "You want one invoice and one collection instead of three.",
        ],
      },
      { kind: "h", text: "When it does not" },
      {
        kind: "list",
        items: [
          "One of the orders is urgent. Consolidating means waiting for the slowest supplier.",
          "The goods types are different enough to need different airports — electronics and normal goods do not fly together.",
        ],
      },
      {
        kind: "note",
        text: "We hold consolidating cargo at our Guangzhou warehouse at no charge while you wait for the rest of your orders. Storage is for cargo moving through, not long-term warehousing.",
      },
    ],
  },
];

export function articleBySlug(slug: string) {
  return ARTICLES.find((article) => article.slug === slug) ?? null;
}

export const LEARN_CATEGORIES = [
  "Getting started",
  "Shipping",
  "Buying in China",
  "Money",
] as const;
