/**
 * Which language a person reads, and which language a piece of text is in.
 *
 * Two languages, deliberately. The staff app is English and Chinese; the
 * customer-facing site is English and Swahili and is a separate concern with
 * separate copy. Mixing the two would put a half-translated staff interface in
 * front of customers.
 */

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

/**
 * The reading language for a user, from whatever their profile happens to hold.
 *
 * `preferredLanguage` is a free string column that already carried "sw" from an
 * earlier profile screen, so this narrows rather than trusts. Anything that is
 * not a staff language reads as English, which is the default every Tanzanian
 * desk works in.
 */
export function localeOf(preferred: string | null | undefined): Locale {
  return preferred === "zh" ? "zh" : "en";
}

const CJK = /[一-鿿㐀-䶿]/;

/**
 * What language a piece of text is in, as far as anyone can tell from looking.
 *
 * Deliberately crude: one Han character means Chinese. Cargo descriptions are
 * seventeen characters on average and routinely mix a model number with a
 * product name, so anything cleverer would be guessing with more steps. Null
 * means "no evidence either way" — a description of "LCD" or "iPad 12" is not
 * Chinese, but it is not really English either, and pretending to know is how
 * a term ends up in the glossary under the wrong key.
 */
export function detectLocale(text: string | null | undefined): Locale | null {
  if (!text) return null;
  if (CJK.test(text)) return "zh";
  return /[a-z]/i.test(text) ? "en" : null;
}

/**
 * The text to show a reader, given the original and whatever translations exist.
 *
 * Falls back to the original rather than to a blank. A warehouse hand who
 * cannot read the Chinese is still better off seeing it than seeing nothing —
 * they can photograph it, or ask — and a missing translation must never look
 * like missing cargo information.
 */
export function pickText(
  locale: Locale,
  original: string | null | undefined,
  translations: { en?: string | null; zh?: string | null } | null | undefined
): string {
  const wanted = locale === "zh" ? translations?.zh : translations?.en;
  return (wanted ?? original ?? "").trim() || (original ?? "");
}

/**
 * Whether what the reader is seeing is the original or a rendering of it.
 *
 * Used to mark translated text in the interface. Somebody reading "Mobile phone
 * accessories" on a consignment registered in Chinese should be able to tell
 * that a machine or a glossary produced that phrase, because when a customer
 * disputes what was shipped the original is the thing that matters.
 */
export function isTranslated(
  locale: Locale,
  sourceLang: string | null | undefined,
  translations: { en?: string | null; zh?: string | null } | null | undefined
): boolean {
  if (!sourceLang || sourceLang === locale) return false;
  return Boolean(locale === "zh" ? translations?.zh : translations?.en);
}
