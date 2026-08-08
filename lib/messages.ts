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
 * Where customers go to track. Read from the environment because the message
 * goes out to a real person — a wrong host here is a dead link in a customer's
 * WhatsApp, not a broken page a developer notices.
 */
const TRACK_URL = `${
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://targetexpress.co.tz"
}/track`;

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
 * The payment reminder a customer actually reads, in Swahili.
 *
 * Written to be acted on rather than acknowledged: greeting, which cargo,
 * what it costs, where to send it, and one reason to do it today. Everything
 * a customer needs to pay is in the message, so nobody has to ring back to
 * ask for an account number.
 *
 * Swahili only. The bilingual templates elsewhere double the length of a
 * WhatsApp message, and a customer who has to scroll past an English copy of
 * what they just read is a customer who stops reading.
 *
 * Short on purpose. Every line earns its place — the accounts are the longest
 * part and they are the part that gets the money in.
 *
 * "Lipa kwa mara moja" is deliberate: part-payments leave cargo on our floor
 * accruing storage and take three phone calls to settle instead of none.
 */
export function paymentReminderSwahili(input: {
  customerName: string;
  trackingNumber: string;
  description: string;
  invoiceNumber: string | null;
  /** Already formatted, in the currency the customer will pay in. */
  amount: string;
}) {
  const first = input.customerName.trim().split(/\s+/)[0] || "mteja";

  /**
   * Each line carries its own account name.
   *
   * A single "Jina la akaunti" under the whole list was wrong and dangerous:
   * CRDB is TARGET(GZ) EXPRESS AIR CARGO and the others are not, so a customer
   * paying into Tanzania Commercial Bank would have checked the name against
   * the wrong one. A mistyped account name is a payment that bounces or, worse,
   * reaches somebody else. This is the one place in the message where extra
   * words buy something.
   */
  const mobile = PAYMENT_ACCOUNTS.mobileMoney.map(
    (account) =>
      `${account.provider}: ${account.number} - ${account.accountName}`
  );
  const banks = PAYMENT_ACCOUNTS.banks.flatMap((bank) =>
    bank.accounts.map(
      (account) =>
        `${bank.bank} (${account.currency}): ${account.number} - ${bank.accountName}`
    )
  );

  return [
    `Habari ${first},`,
    ``,
    `Mzigo wako ${input.trackingNumber} (${input.description}) umefika Dar es Salaam.`,
    input.invoiceNumber ? `Ankara: ${input.invoiceNumber}` : "",
    `Kiasi cha kulipa: ${input.amount}`,
    ``,
    `Njia za malipo:`,
    ...mobile,
    ...banks,
    ``,
    `Tafadhali lipa kwa mara moja ili kuepuka gharama za hifadhi. Mzigo hutolewa baada ya malipo kuthibitishwa.`,
    ``,
    `Asante,`,
    COMPANY.name,
    COMPANY.phone,
  ]
    .filter((line) => line !== "" || true)
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
