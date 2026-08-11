import { Prisma } from "@prisma/client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";

import type { Locale } from "@/lib/locale";

type Numeric = number | string | Prisma.Decimal | null | undefined;

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

/**
 * Round to the cent a currency is actually denominated in.
 *
 * Subtracting two Prisma Decimals through `toNumber` gives IEEE doubles, so a
 * 39.15 bill part-paid with 39 leaves 0.14999999999999858 outstanding. That is
 * fine for arithmetic with a tolerance, and wrong the moment it reaches a
 * person — or a number input with step="0.01", which refuses it outright.
 */
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * How a shilling amount is written on screen.
 *
 * TZS is the ISO code and stays in the database, on invoices and anywhere a
 * bank or a customs form will read it. On screen the business writes TSh, so
 * that is what staff see — one substitution here rather than a decision at
 * every call site, which is how the two spellings ended up on the same page.
 */
const DISPLAY_CURRENCY: Record<string, string> = { TZS: "TSh" };

export function formatMoney(value: Numeric, currency = "TZS") {
  const n = toNumber(value);
  const symbol = DISPLAY_CURRENCY[currency] ?? currency;
  return `${symbol} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWeight(value: Numeric) {
  const n = toNumber(value);
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} kg`;
}

/**
 * Dates in the reader's language.
 *
 * A screen can be entirely Chinese and still say "12 Jul 2026" and "3 hours
 * ago", because a date is formatted rather than written and never passes
 * through the dictionary. date-fns carries the month names and the relative
 * phrasing, so the locale only has to reach this far.
 *
 * The parameter is optional and defaults to English: sixty-odd call sites
 * format a date, most of them in components with no reason to know about
 * language, and a required argument would have been a rename disguised as a
 * translation. Callers that know the reader pass it; the rest keep working.
 */
function dfns(locale: Locale) {
  return locale === "zh" ? { locale: zhCN } : undefined;
}

export function formatDate(
  value: Date | string | null | undefined,
  locale: Locale = "en"
) {
  if (!value) return "—";
  return format(new Date(value), locale === "zh" ? "yyyy年M月d日" : "dd MMM yyyy", dfns(locale));
}

export function formatDateTime(
  value: Date | string | null | undefined,
  locale: Locale = "en"
) {
  if (!value) return "—";
  return format(
    new Date(value),
    locale === "zh" ? "yyyy年M月d日 HH:mm" : "dd MMM yyyy, HH:mm",
    dfns(locale)
  );
}

export function formatRelative(
  value: Date | string | null | undefined,
  locale: Locale = "en"
) {
  if (!value) return "—";
  const distance = formatDistanceToNowStrict(new Date(value), dfns(locale));
  // Chinese puts the "ago" in front — 3 小时前, not 3 小时 前.
  return locale === "zh" ? `${distance}前` : `${distance} ago`;
}

/**
 * Tanzanian numbers get typed in half a dozen shapes (0762…, +255762…,
 * 255762…). Normalise to +255XXXXXXXXX so customer lookup actually matches.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("255")) return `+${digits}`;
  if (digits.startsWith("0")) return `+255${digits.slice(1)}`;
  if (digits.startsWith("86")) return `+${digits}`; // China
  if (digits.length === 9) return `+255${digits}`;
  return `+${digits}`;
}

/** Tracking / batch numbers are typed by hand constantly — be forgiving. */
export function normaliseCode(input: string) {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");

  /**
   * Put the dash back into a tracking number.
   *
   * Tracking numbers are TX-000131, and people type TX000131, tx131, or read
   * one off a label without the dash. Every one of those found nothing, which
   * on a page whose entire job is a lookup reads as "your cargo does not
   * exist" — and now that the label carries a typeable /track/TX-000131 link,
   * a missed dash is a customer who thinks we lost their box.
   *
   * Only TX followed by digits is touched. Batch numbers (BATCH-2026-001) and
   * China batch codes (GZ-SHIP-2026-001) carry letters and more than one dash,
   * and are left exactly as typed.
   */
  const tx = value.replace(/-/g, "").match(/^TX(\d{1,6})$/);
  if (tx) return `TX-${tx[1].padStart(6, "0")}`;

  return value;
}
