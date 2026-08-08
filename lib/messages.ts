import "server-only";

import type { MessageKind } from "@prisma/client";

import { COMPANY, PAYMENT_METHODS, STORAGE_POLICY } from "@/lib/constants";
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
const PUBLIC_HOST = (() => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!configured) return "https://targetexpress.co.tz";
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(configured)
    ? "https://targetexpress.co.tz"
    : configured;
})();

const TRACK_URL = `${PUBLIC_HOST}/track`;

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function money(context: MessageContext) {
  const parts: string[] = [];
  if (context.amountUsd !== null && context.amountUsd !== undefined) {
    parts.push(formatUsd(context.amountUsd));
  }
  if (context.amountLocal !== null && context.amountLocal !== undefined) {
    parts.push(formatLocal(context.amountLocal, context.localCurrency ?? "TZS"));
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
  "Tunafurahi kukujulisha kuwa mzigo wako umefika salama kwenye *warehouse yetu ya Dar es Salaam* na uko tayari kuchukuliwa baada ya malipo kuthibitishwa.";

function moneyMessage(context: MessageContext, opening: string) {
  const name = firstName(context.customerName);
  const tracking = context.trackingNumber ?? "";
  const bold = (text: string) => `*${text}*`;

  return [
    `📦 ${bold(COMPANY.name.toUpperCase())}`,
    ``,
    `${bold(`Habari ${name},`)}`,
    ``,
    opening,
    ``,
    `📋 ${bold("Maelezo ya Mzigo")}`,
    ...(tracking ? [`• ${bold("Tracking No.:")} ${tracking}`] : []),
    ...(context.invoiceNumber
      ? [`• ${bold("Invoice No.:")} ${context.invoiceNumber}`]
      : []),
    ...(context.description ? [`• ${bold("Mzigo:")} ${context.description}`] : []),
    ...(context.weightKg !== null && context.weightKg !== undefined
      ? [`• ${bold("Uzito:")} ${context.weightKg} kg`]
      : []),
    ...(context.exchangeRate
      ? [
          `• ${bold("Rate:")} USD 1 = TZS ${context.exchangeRate.toLocaleString("en-US")}`,
        ]
      : []),
    `• ${bold("Kiasi:")} ${bold(money(context))}`,
    ``,
    `📄 ${bold("Angalia invoice yako kamili:")}`,
    `🔗 ${TRACK_URL}${tracking ? `?q=${encodeURIComponent(tracking)}` : ""}`,
    ``,
    `💳 ${bold("Njia za Malipo")}`,
    ``,
    ...paymentBlock(bold),
    `Baada ya kufanya malipo, tafadhali tuma ${bold("uthibitisho wa malipo")} ili timu yetu iweze kuuhakiki. Malipo yakishathibitishwa, utapokea ${bold("Pickup Note")} ya kuchukua mzigo wako.`,
    ``,
    `⚠️ ${bold("Tafadhali chukua mzigo wako mapema ili kuepuka gharama za storage.")}`,
    ``,
    ...officeBlock(bold),
    `Asante kwa kutumia ${bold(COMPANY.name)}.`,
    ``,
    `📞 ${bold(COMPANY.phone)}`,
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
        `Tunaukagua na tutakutumia invoice hivi punde.\n\n` +
        `Hello ${name}, your cargo ${tracking} has arrived in Dar es Salaam. ` +
        `We are checking it in and will send your invoice shortly.` +
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

    case "STORAGE_REMINDER":
      return (
        `Habari ${name}, mzigo wako ${tracking} umekaa ghalani ` +
        `siku ${context.storageDays ?? 0}. Siku ${STORAGE_POLICY.freeDays} za kwanza ni bure, ` +
        `baada ya hapo ni USD ${STORAGE_POLICY.perDayUsd} kwa siku. ` +
        `Tafadhali chukua mzigo wako mapema.\n\n` +
        `Hello ${name}, cargo ${tracking} has been in our warehouse for ` +
        `${context.storageDays ?? 0} days. Storage charges apply after the free period — ` +
        `please collect it soon.` +
        sign
      );

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
    `📍 ${bold("OFISI ZETU")}`,
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
      exchangeRate: input.exchangeRate,
      amountUsd: input.amountUsd,
      amountLocal: input.amountLocal,
      localCurrency: input.localCurrency,
    },
    ARRIVED_AND_HELD
  );
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
