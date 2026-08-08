import "server-only";

import type { MessageKind } from "@prisma/client";

import { COMPANY, PAYMENT_ACCOUNTS, STORAGE_POLICY } from "@/lib/constants";
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
        `Tunaukagua na tutakutumia ankara hivi punde.\n\n` +
        `Hello ${name}, your cargo ${tracking} has arrived in Dar es Salaam. ` +
        `We are checking it in and will send your invoice shortly.` +
        sign
      );

    case "INVOICE_ISSUED":
      return (
        `Habari ${name}, ankara yako ${context.invoiceNumber ?? ""} ya mzigo ${tracking} ` +
        `ni ${money(context)}.\n` +
        `Lipa kupitia: ${PAYMENT_ACCOUNTS.mobileMoney[0].provider} ${PAYMENT_ACCOUNTS.mobileMoney[0].number} ` +
        `au ${PAYMENT_ACCOUNTS.banks[0].bank} ${PAYMENT_ACCOUNTS.banks[0].accounts[0].number}.\n` +
        `Mzigo hutolewa baada ya malipo kukamilika.\n\n` +
        `Hello ${name}, invoice ${context.invoiceNumber ?? ""} for shipment ${tracking} ` +
        `is ${money(context)}. Cargo is released once payment is confirmed.` +
        sign
      );

    case "PAYMENT_REMINDER":
      return (
        `Habari ${name}, tunakukumbusha kuhusu malipo ya ${money(context)} ` +
        `kwa ankara ${context.invoiceNumber ?? ""} (mzigo ${tracking}). ` +
        `Mzigo wako uko tayari na unatusubiri.\n\n` +
        `Hello ${name}, a reminder that ${money(context)} is outstanding on invoice ` +
        `${context.invoiceNumber ?? ""}. Your cargo is with us and waiting.` +
        sign
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
 * Short names for the message, where the legal name is a mouthful.
 *
 * The NUMBERS still come from PAYMENT_ACCOUNTS and are never restated here —
 * one source of truth for the thing that decides where money lands. This map
 * only shortens what a customer reads on a phone.
 */
const BANK_LABEL: Record<string, string> = {
  "Tanzania Commercial Bank": "TCB Bank",
  "Vodacom (M-Pesa)": "Vodacom M-Pesa",
};

const label = (name: string) => BANK_LABEL[name] ?? name;

/**
 * The payment reminder a customer actually reads, in Swahili.
 *
 * Written to be acted on rather than acknowledged: which cargo, what it costs,
 * where to send it, and what happens once they have. Everything needed to pay
 * is in the message, so nobody rings back to ask for an account number.
 *
 * Formatted for WhatsApp specifically. Asterisks are its bold, a blank line is
 * its paragraph, and each account is three short lines — provider, number,
 * name — because that is how a person checks a number on a phone: one glance
 * per line, not a sentence to be parsed. Markdown's two-space line break does
 * nothing here and would arrive as trailing whitespace, so every break is a
 * real newline.
 *
 * Swahili only. The bilingual templates elsewhere double the length, and a
 * customer scrolling past an English copy of what they just read stops
 * reading.
 *
 * Every account carries its OWN name. CRDB is TARGET(GZ) EXPRESS AIR CARGO and
 * the others are not — one name printed under a list of five is how a payment
 * bounces, or reaches somebody else.
 */
export function paymentReminderSwahili(input: {
  customerName: string;
  trackingNumber: string;
  description: string;
  invoiceNumber: string | null;
  /** Already formatted, in the currency the customer will actually send. */
  amount: string;
}) {
  const first = input.customerName.trim().split(/\s+/)[0] || "mteja";

  // Where the customer can see the bill themselves. The staff PDF sits behind
  // a login, so this is the public tracking page — which already shows the
  // cost, what has been paid and whether the cargo may be collected.
  const invoiceLink = `${TRACK_URL}?q=${encodeURIComponent(input.trackingNumber)}`;

  const accounts = [
    ...PAYMENT_ACCOUNTS.mobileMoney.map((account) => [
      `*${label(account.provider)}*`,
      account.number,
      `*${account.accountName}*`,
    ]),
    ...PAYMENT_ACCOUNTS.banks.flatMap((bank) =>
      bank.accounts.map((account) => [
        `*${label(bank.bank)} (${account.currency})*`,
        account.number,
        `*${bank.accountName}*`,
      ])
    ),
  ];

  return [
    `📦 *${COMPANY.name.toUpperCase()}*`,
    ``,
    `Habari *${first}*,`,
    ``,
    `Tunafurahi kukujulisha kuwa mzigo wako umefika salama kwenye *warehouse yetu ya Dar es Salaam* na uko tayari kuchukuliwa baada ya malipo kuthibitishwa.`,
    ``,
    `*📋 Maelezo ya Mzigo*`,
    ``,
    `• *Tracking No.:* ${input.trackingNumber}`,
    `• *Bidhaa:* ${input.description}`,
    ...(input.invoiceNumber ? [`• *Invoice No.:* ${input.invoiceNumber}`] : []),
    `• *Kiasi cha Kulipa:* *${input.amount}*`,
    ``,
    `📄 *Angalia invoice yako kamili hapa:*`,
    `🔗 ${invoiceLink}`,
    ``,
    `*💳 Njia za Malipo*`,
    ``,
    ...accounts.flatMap((lines) => [...lines, ``]),
    `✅ Baada ya kufanya malipo, tafadhali tuma uthibitisho wa malipo. Malipo yakishathibitishwa, utapokea *Pickup Note* ya kuchukua mzigo wako.`,
    ``,
    `⚠️ *Tafadhali chukua mzigo wako mapema ili kuepuka gharama za storage.*`,
    ``,
    `Asante kwa kuchagua *${COMPANY.name}*.`,
    ``,
    `📞 ${COMPANY.phone}`,
  ]
    .join("\n")
    // Three or more breaks anywhere means a section ended with its own blank
    // line and the next began with one. WhatsApp renders every one of them.
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
