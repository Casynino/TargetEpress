import "server-only";

import { detectLocale, type Locale } from "@/lib/locale";
import { prisma, type TxClient } from "@/lib/prisma";

/**
 * Turning what the Guangzhou desk typed into what the Dar counter reads.
 *
 * Three sources, in this order, and the order is the whole design:
 *
 *  1. THE GLOSSARY. The vocabulary this business ships is small and repeats —
 *     130 consignments produced 101 distinct descriptions, and the commonest
 *     appeared sixteen times. A term that is in the book is rendered instantly,
 *     free, and identically every time. That last property is the one a
 *     translation service cannot offer: it will say "Accessories" this week and
 *     "Fittings" next week for 配件, and a warehouse cannot reconcile a
 *     vocabulary that drifts under it.
 *
 *  2. A TRANSLATION SERVICE, if one is configured. Optional on purpose. The
 *     system runs today with no paid API of any kind, and registering cargo at
 *     a counter must not wait on a network call to a third party — so this
 *     never blocks a save and never fails one.
 *
 *  3. NOTHING. The original stands, and the reader sees the words a person
 *     actually typed. A missing translation is a small inconvenience; a blank
 *     cargo description is a box nobody can identify.
 *
 * Whatever comes back, the original column is never written to.
 */

export type Translated = {
  /** The text as typed. Returned unchanged, always. */
  original: string;
  en: string | null;
  zh: string | null;
  /** The language the original is in, as far as it can be told. */
  lang: Locale | null;
};

/** Trim and drop the width variants a Chinese IME produces, so keys match. */
function normalise(term: string) {
  return term
    .trim()
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, " ");
}

/**
 * The shape the Guangzhou desk has been typing for years: "Accessories (配件)".
 *
 * Staff invented this to solve the very problem this module now solves
 * properly, and it is still what most existing cargo looks like — so text that
 * arrives already carrying both languages is split rather than translated, and
 * the pair is learned.
 */
const PAIR = /^(.+?)\s*[（(]\s*([^（()）]+?)\s*[)）]\s*$/;

function splitPair(text: string): { en: string; zh: string } | null {
  const match = normalise(text).match(PAIR);
  if (!match) return null;
  const [, a, b] = match;
  const aLang = detectLocale(a);
  const bLang = detectLocale(b);
  if (aLang === bLang || !aLang || !bLang) return null;
  return aLang === "zh" ? { zh: a.trim(), en: b.trim() } : { zh: b.trim(), en: a.trim() };
}

/**
 * A translation service, if the deployment has one.
 *
 * Kept behind an environment variable and a plain fetch rather than a vendor
 * SDK: the whole integration is one HTTP call, and a dependency that has to be
 * upgraded forever is a poor trade for it. Absent a key this returns null and
 * the glossary carries the system on its own, which is how it runs today.
 */
async function machineTranslate(
  text: string,
  from: Locale,
  to: Locale
): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
        // A counter clerk is standing in front of a customer. If the service is
        // slow, the cargo is saved without a translation and the glossary picks
        // it up later — waiting is never the right answer here.
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const out = data.data?.translations?.[0]?.translatedText?.trim();
    return out && out !== text ? out : null;
  } catch {
    // Timeout, DNS, quota, a malformed response — all the same answer. The
    // save proceeds and the original is intact.
    return null;
  }
}

/**
 * Render one piece of text into both languages.
 *
 * Never throws and never blocks on anything it cannot control. The worst case
 * it returns is the original with both translations null, which every display
 * in the system already handles by showing the original.
 */
export async function translateText(
  raw: string | null | undefined,
  options: { learn?: boolean; tx?: TxClient } = {}
): Promise<Translated | null> {
  const original = (raw ?? "").trim();
  if (!original) return null;

  const db = options.tx ?? prisma;

  // Already bilingual? Take both halves and teach the glossary the pairing.
  const pair = splitPair(original);
  if (pair) {
    if (options.learn) await learnTerm(db, pair.zh, pair.en, "STAFF");
    return { original, en: pair.en, zh: pair.zh, lang: detectLocale(original) };
  }

  const lang = detectLocale(original);
  if (!lang) {
    // A model number, a brand, "LCD". Nothing to translate and nothing gained
    // by guessing — it reads the same in both languages.
    return { original, en: original, zh: original, lang: null };
  }

  const other: Locale = lang === "zh" ? "en" : "zh";
  const key = normalise(original);

  const known = await db.cargoTerm.findFirst({
    where: lang === "zh" ? { zh: key } : { en: { equals: key, mode: "insensitive" } },
    select: { id: true, zh: true, en: true },
  });

  if (known) {
    await db.cargoTerm.update({
      where: { id: known.id },
      data: { timesUsed: { increment: 1 } },
    });
    return { original, en: known.en, zh: known.zh, lang };
  }

  const machine = await machineTranslate(original, lang, other);
  if (!machine) return { original, en: lang === "en" ? original : null, zh: lang === "zh" ? original : null, lang };

  const zh = lang === "zh" ? original : machine;
  const en = lang === "en" ? original : machine;
  if (options.learn) await learnTerm(db, zh, en, "MACHINE");
  return { original, en, zh, lang };
}

/**
 * Add a pairing to the book, or leave a better one alone.
 *
 * A machine guess never overwrites a term a person has confirmed. That rule is
 * the reason the glossary is trustworthy at all: it only ever gets better.
 */
async function learnTerm(
  db: TxClient,
  zh: string,
  en: string,
  source: "STAFF" | "MACHINE"
) {
  const key = normalise(zh);
  const english = normalise(en);
  if (!key || !english) return;

  const existing = await db.cargoTerm.findUnique({
    where: { zh: key },
    select: { id: true, source: true, verifiedAt: true },
  });

  if (!existing) {
    await db.cargoTerm.create({ data: { zh: key, en: english, source, timesUsed: 1 } });
    return;
  }

  // A person's word beats a machine's; nothing beats a verified one.
  const canImprove =
    !existing.verifiedAt && source === "STAFF" && existing.source === "MACHINE";
  await db.cargoTerm.update({
    where: { id: existing.id },
    data: {
      timesUsed: { increment: 1 },
      ...(canImprove ? { en: english, source: "STAFF" as const } : {}),
    },
  });
}

/**
 * The columns to write for a translated field, ready to spread into a Prisma
 * `data`. Keeps every call site from repeating the same four-key shape and
 * from ever accidentally writing over the original.
 */
export function translationColumns(field: string, t: Translated | null) {
  if (!t) return {};
  return {
    [field]: t.original,
    [`${field}En`]: t.en,
    [`${field}Zh`]: t.zh,
    [`${field}Lang`]: t.lang,
  } as Record<string, string | null>;
}
