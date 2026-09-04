import "server-only";

import type { MessageKind } from "@prisma/client";

import { COMPANY, PAYMENT_METHODS, STORAGE_POLICY } from "@/lib/constants";
import { siteUrl } from "@/lib/site-url";
import { formatLocal, formatUsd } from "@/lib/fx";

/**
 * What we say to customers, and when.
 *
 * Two honest constraints shaped this:
 *
 *  1. The system does not deliver anything. It composes the wording and opens
 *     WhatsApp with it; a member of staff presses send. So a logged message
 *     means "we contacted them", never "the system notified them" — anything
 *     stronger would be a claim the code cannot back up.
 *  2. Swahili first. These go to customers, and Swahili is what they read.
 *     English follows for the traders who prefer it.
 */

export type MessageContext = {
  customerName: string;
  trackingNumber?: string | null;
  description?: string | null;
  batchNumber?: string | null;
  invoiceNumber?: string | null;
  amountUsd?: number | null;
  amountLocal?: number | null;
  localCurrency?: string | null;
  storageDays?: number | null;
  /** Off the cargo record. Nobody at a desk should be typing a weight. */
  weightKg?: number | null;
  /**
   * How the freight figure was reached: the per-kilo rate, or the per-item
   * price, exactly as the invoice states it.
   *
   * The customer could see the amount and the exchange rate but never the
   * arithmetic between them — so "USD 12.00" arrived as a number to be taken
   * on trust. This is the line that makes it checkable: rate × weight.
   */
  freightBasis?: string | null;
  /**
   * The rate FROZEN ON THIS INVOICE, never today's published one.
   *
   * A customer who was quoted at 2,700 and reads 2,800 next month believes the
   * bill changed. The invoice carries its own rate precisely so that cannot
   * happen, and this is the only rate a message may print.
   */
  exchangeRate?: number | null;
};

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  SHIPMENT_REGISTERED: "Cargo received in China",
  IN_TRANSIT: "In transit",
  ARRIVED_DAR: "Arrived in Tanzania",
  INVOICE_ISSUED: "Invoice issued",
  PAYMENT_REMINDER: "Payment reminder",
  READY_FOR_PICKUP: "Ready for pickup",
  STORAGE_REMINDER: "Storage reminder",
  GENERAL: "General message",
};

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  PHONE: "Phone call",
  SMS: "SMS",
  EMAIL: "Email",
  IN_PERSON: "In person",
  SOCIAL: "Social media",
};

/**
 * Where customers go to track.
 *
 * Read from the environment because the message goes out to a real person — a
 * wrong host here is a dead link in a customer's WhatsApp, not a broken page a
 * developer notices.
 *
 * A localhost value is REFUSED rather than used. NEXT_PUBLIC_SITE_URL is
 * "http://localhost:3000" in this repo's .env, which is correct for a dev
 * server and catastrophic in a customer message: anybody testing a reminder
 * from their own machine would send a link that resolves to the customer's own
 * phone. The public domain is the only sane answer for a message leaving the
 * building, so that is what a local value falls back to.
 */
/**
 * Where a customer is sent, from the one place that decides it.
 *
 * A deployment URL is not an address this company promised anyone, and
 * lib/site-url already refuses one for the QR codes and the canonical URLs.
 * The same answer here, so a customer's WhatsApp link and the QR on their box
 * cannot point at two different domains.
 */
const PUBLIC_HOST = siteUrl();

const TRACK_URL = `${PUBLIC_HOST}/track`;

/**
 * The name to greet somebody by.
 *
 * Capitalised, because customers are registered however the desk happened to
 * type them — "sam", "lengai store" — and a message that opens "Habari sam,"
 * reads as carelessness to the person it is addressed to. Only the first
 * letter is touched: nothing else about how they wrote their own name is this
 * function's business.
 */
function firstName(fullName: string) {
  const first = fullName.trim().split(/\s+/)[0] ?? fullName;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}

/**
 * The amount, in both currencies, for a message.
 *
 * The ISO code rather than the TSh symbol the screens use, because the line
 * directly above this one states the exchange rate as "USD 1 = TZS 2,700" —
 * and one message calling the same currency two things is the kind of small
 * wrongness a customer notices and a desk then has to explain.
 */
function money(context: MessageContext) {
  const parts: string[] = [];
  if (context.amountUsd !== null && context.amountUsd !== undefined) {
    parts.push(formatUsd(context.amountUsd));
  }
  if (context.amountLocal !== null && context.amountLocal !== undefined) {
    const code = context.localCurrency ?? "TZS";
    parts.push(`${code} ${Math.round(context.amountLocal).toLocaleString("en-US")}`);
  }
  return parts.join(" / ");
}

/** Composes the message body for a kind. Editable before it is sent. */
/**
 * The two messages that ask a customer for money, in one shape.
 *
 * An invoice being issued and a payment being chased are the same conversation
 * at two moments — here is the cargo, here is what it weighs, here is the rate
 * we used, here is the amount, here is where to send it. Only the opening line
 * differs, so only the opening line is passed in: two hand-written versions
 * drift apart within a month and the one that drifts is the one a customer
 * reads.
 *
 * Everything a customer needs to pay correctly is here and nothing else is.
 * The weight comes off the cargo record and the rate off the invoice, so no
 * clerk types either and neither can disagree with the bill.
 *
 * Simple Swahili, at the owner's instruction: "Invoice", not "Ankara".
 */
/**
 * How both money messages open.
 *
 * One sentence, one place. The invoice going out and the reminder chasing it
 * are the same news to the person receiving them — the cargo is here, safe,
 * and waiting on payment — and two copies of that sentence drift apart the
 * first time one is reworded.
 */
const ARRIVED_AND_HELD =
  "Mzigo wako umefika salama Dar es Salaam na uko tayari kuchukuliwa baada ya malipo kuthibitishwa.";

function moneyMessage(context: MessageContext, opening: string) {
  const name = firstName(context.customerName);
  const tracking = context.trackingNumber ?? "";

  /*
    THE OWNER'S OWN WORDING, KEPT SHORT ON PURPOSE.

    This used to carry the payment accounts, the office addresses and the
    phone number as well — a wall of text on a phone, where the part that
    matters scrolled off the top. The link answers all of it and is always
    current, which a pasted account number is not: one mistyped Lipa number in
    a template sends every customer's money nowhere.

    So the message states what the cargo is, what it weighs, what rate was
    used, what it comes to in both currencies, and where the full invoice and
    the payment accounts live. Nothing a desk types, nothing that can drift.
  */
  /*
    NO FOUR-BYTE EMOJI. THEY ARRIVE AS A BLACK DIAMOND.

    📦 📋 📄 🔗 all sit outside the Basic Multilingual Plane, and WhatsApp's
    DESKTOP client corrupts those when they come through a wa.me ?text=
    prefill — the customer receives "� TARGET EXPRESS AIR CARGO". Our link is
    correct: the URL carries %F0%9F%93%A6, which is valid UTF-8, and it
    round-trips cleanly. The client is what breaks, and a desk sending from a
    laptop cannot know it happened because the sender sees their own copy.

    So the structure is carried by WhatsApp's own bold instead, which is plain
    ASCII asterisks and survives every client there is. It reads as deliberate
    rather than decorated, and nothing can turn it into a question mark.
  */
  const bold = (text: string) => `*${text}*`;

  return [
    bold(COMPANY.name.toUpperCase()),
    ``,
    `Habari ${name},`,
    opening,
    ``,
    bold("MAELEZO YA MZIGO"),
    ...(tracking ? [`• Tracking: ${tracking}`] : []),
    ...(context.description ? [`• Bidhaa: ${context.description}`] : []),
    ...(context.weightKg !== null && context.weightKg !== undefined
      ? [`• Uzito: ${context.weightKg} KG`]
      : []),
    ...(context.freightBasis ? [`• Rate: ${context.freightBasis}`] : []),
    ...(context.exchangeRate
      ? [
          `• Exchange Rate: USD 1 = TZS ${context.exchangeRate.toLocaleString("en-US")}`,
        ]
      : []),
    `• Jumla: ${money(context)}`,
    ``,
    /*
      The storage clock, in one line and in the message itself.

      A customer who does not know it has started cannot beat it, and the
      first they hear of a charge is when it is on the bill. The days and the
      daily fee come from STORAGE_POLICY so the sentence cannot drift from
      what the system will actually charge.
    */
    `${bold("STORAGE:")} Siku ${STORAGE_POLICY.freeDays} bure, baada ya hapo USD ${STORAGE_POLICY.perDayUsd}/siku hadi mzigo uchukuliwe.`,
    ``,
    bold("Angalia invoice yako kamili na njia za malipo:"),
    `${TRACK_URL}${tracking ? `?q=${encodeURIComponent(tracking)}` : ""}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function composeMessage(
  kind: MessageKind,
  context: MessageContext
): string {
  const name = firstName(context.customerName);
  const tracking = context.trackingNumber ?? "";
  const cargo = context.description ?? "mzigo wako";
  const sign = `\n\n${COMPANY.name}\n${COMPANY.phone}`;

  switch (kind) {
    case "SHIPMENT_REGISTERED":
      return (
        `Habari ${name}, mzigo wako (${cargo}) umepokelewa katika ghala letu China.\n` +
        `Namba ya kufuatilia: ${tracking}\n` +
        `Fuatilia hapa: ${TRACK_URL}\n\n` +
        `Hello ${name}, we have received your cargo at our China warehouse. ` +
        `Track it any time with ${tracking}.` +
        sign
      );

    case "IN_TRANSIT":
      return (
        `Habari ${name}, mzigo wako ${tracking} umeondoka China` +
        (context.batchNumber ? ` (batch ${context.batchNumber})` : "") +
        ` na uko njiani kuja Dar es Salaam.\n\n` +
        `Hello ${name}, your cargo ${tracking} has left China and is on its way to Dar es Salaam.` +
        sign
      );

    case "ARRIVED_DAR":
      return (
        `Habari ${name}, mzigo wako ${tracking} umefika Dar es Salaam. ` +
        `Tunaukagua na tutakutumia invoice hivi punde.\n` +
        `Unapata siku ${STORAGE_POLICY.freeDays} za kuhifadhi bure kuanzia leo. ` +
        `Baada ya hapo ni USD ${STORAGE_POLICY.perDayUsd} kwa siku.\n\n` +
        `Hello ${name}, your cargo ${tracking} has arrived in Dar es Salaam. ` +
        `We are checking it in and will send your invoice shortly. ` +
        `Your ${STORAGE_POLICY.freeDays} free storage days start today.` +
        sign
      );

    case "INVOICE_ISSUED":
      // The cargo has landed and is being held for payment. Both money
      // messages open on that, because it is the fact the customer cares
      // about — "we are reminding you" reads as a complaint about them.
      return moneyMessage(context, ARRIVED_AND_HELD);

    case "PAYMENT_REMINDER":
      return moneyMessage(
        context,
        "Tunakukumbusha kuwa malipo ya mzigo wako bado hayajakamilika:"
      );

    case "READY_FOR_PICKUP":
      return (
        `Habari ${name}, malipo yamekamilika na mzigo wako ${tracking} ` +
        `uko tayari kuchukuliwa katika ofisi yetu ${COMPANY.offices[0].address}.\n` +
        `Njoo na namba hii ya kufuatilia.\n` +
        `Siku ${STORAGE_POLICY.freeDays} za kwanza za kuhifadhi ni bure.\n\n` +
        `Hello ${name}, payment is complete and cargo ${tracking} is ready for ` +
        `collection at our office. Bring this tracking number with you.` +
        sign
      );

    case "STORAGE_REMINDER": {
      /* `storageDays` is the CHARGEABLE count — days past the free week, not
         days held. Quoting it as "has been here N days" understated the stay
         by a whole week and made a charging consignment read as still free. */
      const over = context.storageDays ?? 0;
      const held = STORAGE_POLICY.freeDays + over;
      const fee = over * STORAGE_POLICY.perDayUsd;
      return (
        `Habari ${name}, mzigo wako ${tracking} umekaa ghalani siku ${held}. ` +
        `Siku ${STORAGE_POLICY.freeDays} za kwanza zilikuwa bure, na sasa umevuka kwa ` +
        `siku ${over}.\n` +
        `Storage fee hadi leo: *USD ${fee.toFixed(2)}* ` +
        `(USD ${STORAGE_POLICY.perDayUsd} kwa siku, inaendelea kuongezeka).\n` +
        `Tafadhali chukua mzigo wako mapema ili kusitisha gharama hii.\n\n` +
        `Hello ${name}, cargo ${tracking} has now been in our warehouse ${held} days — ` +
        `${over} day(s) past your ${STORAGE_POLICY.freeDays} free days. ` +
        `Storage so far is USD ${fee.toFixed(2)} and keeps growing at ` +
        `USD ${STORAGE_POLICY.perDayUsd} a day until you collect.` +
        sign
      );
    }

    case "GENERAL":
    default:
      return `Habari ${name},\n\n` + sign;
  }
}

/** Which message the shipment's own state calls for. */
export function suggestedKind(input: {
  status: string;
  hasInvoice: boolean;
  outstanding: number;
  storageDays: number;
}): MessageKind {
  if (input.status === "READY_FOR_PICKUP") {
    return input.storageDays > 0 ? "STORAGE_REMINDER" : "READY_FOR_PICKUP";
  }
  if (input.status === "RECEIVED_AT_DAR") {
    if (!input.hasInvoice) return "ARRIVED_DAR";
    return input.outstanding > 0 ? "PAYMENT_REMINDER" : "READY_FOR_PICKUP";
  }
  if (input.status === "IN_TRANSIT") return "IN_TRANSIT";
  if (input.status === "READY_TO_DEPART") return "SHIPMENT_REGISTERED";
  return "GENERAL";
}

/** A wa.me link that opens WhatsApp with the message already typed. */
/**
 * How a customer is told to pay. One block, every surface, every method.
 *
 * Three lines each — what to open, the number, the name they must see before
 * confirming — because that is how somebody checks a number on a phone: one
 * glance per line, not a sentence to parse.
 *
 * Nothing is shortened. "Mixx: 7122055" makes a customer guess whether that is
 * a Lipa number, a personal number or an account, and a guess here is money
 * sent somewhere it cannot be recovered from. The labels carry the service, the
 * kind of number, and the currency for banks.
 *
 * Read straight from PAYMENT_METHODS, so a number changed there changes here,
 * on the invoice, in the PDF and on the public site at the same moment.
 */
function paymentBlock(bold: (text: string) => string) {
  return PAYMENT_METHODS.flatMap((method) => [
    bold(method.label),
    method.number,
    bold(method.accountName),
    ``,
  ]);
}

/**
 * Where to find us, laid out so somebody could actually go there.
 *
 * One line per address put the street, the landmark and the city in a single
 * run that WhatsApp wrapped wherever it ran out of room — usually mid-street.
 * An address is scanned in the shape it is written on an envelope, so it is
 * written that way.
 *
 * The breaks come from configuration rather than from splitting the one-line
 * version on commas: guessing where an address divides gets it wrong for the
 * next office added.
 */
function officeBlock(bold: (text: string) => string) {
  const dar = COMPANY.offices[0];
  const china = COMPANY.chinaOffice;
  return [
    `${bold("OFISI ZETU")}`,
    ``,
    `${dar.flag} ${bold(`${dar.city.toUpperCase()} — ${dar.country}`)}`,
    ...dar.lines,
    ``,
    `${china.flag} ${bold(`${china.city.toUpperCase()} — ${china.country}`)}`,
    ...china.lines,
    ``,
  ];
}

/**
 * The reminder the follow-up queue sends.
 *
 * Deliberately the SAME message the invoice composer drafts. There is one way
 * this business asks to be paid, and two builders producing two versions of it
 * is how a customer gets one set of accounts on Monday and another on Friday.
 */
export function paymentReminderSwahili(input: {
  customerName: string;
  trackingNumber: string;
  description: string;
  invoiceNumber: string | null;
  weightKg?: number | null;
  freightBasis?: string | null;
  /** The invoice's own rate. Never today's. */
  exchangeRate?: number | null;
  amountUsd?: number | null;
  amountLocal?: number | null;
  localCurrency?: string | null;
}) {
  return moneyMessage(
    {
      customerName: input.customerName,
      trackingNumber: input.trackingNumber,
      description: input.description,
      invoiceNumber: input.invoiceNumber,
      weightKg: input.weightKg,
      freightBasis: input.freightBasis,
      exchangeRate: input.exchangeRate,
      amountUsd: input.amountUsd,
      amountLocal: input.amountLocal,
      localCurrency: input.localCurrency,
    },
    ARRIVED_AND_HELD
  );
}

/**
 * The reminder for a customer holding SEVERAL unpaid consignments.
 *
 * The per-consignment reminder above names one tracking number and one figure.
 * Sent three times to the same person it reads as three separate demands, and
 * the customer answers by paying one of them and asking which of the other two
 * the next message was about. This states the whole position once — every
 * consignment, one total, one payment — which is also exactly what the screen
 * that sends it is for.
 *
 * Same opening as every other money message: the cargo is here and safe. What
 * the customer cares about is their boxes, not our accounts.
 */
export function severalBillsReminderSwahili(input: {
  customerName: string;
  lines: { trackingNumber: string; description: string; amount: string }[];
  total: string;
  totalUsd?: string | null;
}) {
  const bold = (text: string) => `*${text}*`;
  return [
    `${bold(COMPANY.name.toUpperCase())}`,
    ``,
    `${bold(`Habari ${firstName(input.customerName)},`)}`,
    ``,
    ARRIVED_AND_HELD,
    ``,
    `${bold(`Mizigo yako ${input.lines.length} inasubiri malipo`)}`,
    ...input.lines.map(
      (line) =>
        `• ${bold(line.trackingNumber)}${line.description ? ` — ${line.description}` : ""}: ${line.amount}`
    ),
    ``,
    `${bold("JUMLA:")} ${input.total}${input.totalUsd ? ` (${input.totalUsd})` : ""}`,
    ``,
    /* One transfer, because the desk can now receive it as one. Asking for
       three separate payments is what the combined screen was built to end. */
    "Unaweza kulipia yote kwa malipo moja.",
    ``,
    `${bold("Njia za Malipo")}`,
    ``,
    ...paymentBlock(bold),
    `Baada ya kufanya malipo, tafadhali tuma ${bold("uthibitisho wa malipo")} ili timu yetu iweze kuuhakiki.`,
    ``,
    `Asante kwa kutumia ${bold(COMPANY.name)}.`,
    ``,
    `${bold(COMPANY.phone)}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function whatsappLink(phone: string | null, body: string) {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  const target = digits.startsWith("0")
    ? `255${digits.slice(1)}`
    : digits.startsWith("255")
      ? digits
      : digits;
  return `https://wa.me/${target}?text=${encodeURIComponent(body)}`;
}
