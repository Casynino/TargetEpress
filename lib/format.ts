import { Prisma } from "@prisma/client";
import { format, formatDistanceToNowStrict } from "date-fns";

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

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy");
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy, HH:mm");
}

export function formatRelative(value: Date | string | null | undefined) {
  if (!value) return "—";
  return `${formatDistanceToNowStrict(new Date(value))} ago`;
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
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
