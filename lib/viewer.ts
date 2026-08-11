import "server-only";

import { cache } from "react";

import { localeOf, pickText, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

/**
 * The language the person looking at this page reads in.
 *
 * Wrapped in React's `cache` so a screen that resolves twenty cargo
 * descriptions asks the database once per request rather than twenty times.
 *
 * Defaults to English for everyone, including a signed-out request, because
 * every Tanzanian desk works in English and a screen that guesses Chinese
 * because of a stale session is worse than one that never guesses at all.
 */
export const viewerLocale = cache(async (): Promise<Locale> => {
  const user = await currentUser();
  if (!user) return "en";
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferredLanguage: true },
  });
  return localeOf(me?.preferredLanguage);
});

/** The four columns every translated field carries. */
export type TranslatedField = {
  en?: string | null;
  zh?: string | null;
  lang?: string | null;
};

/**
 * Read a translated field the way this viewer should see it.
 *
 * `cargoText(locale, row, "description")` returns the English rendering for a
 * Dar clerk and the Chinese original for a Guangzhou packer, from the same
 * row, with no page needing to know which language anything was typed in.
 *
 * Falls back to the original whenever a rendering is missing. A cargo
 * description is how a warehouse hand identifies a box; it must never be blank
 * because a translation was not available.
 */
export function cargoText<T extends Record<string, unknown>>(
  locale: Locale,
  row: T,
  field: string
): string {
  const original = row[field] as string | null | undefined;
  return pickText(locale, original, {
    en: row[`${field}En`] as string | null | undefined,
    zh: row[`${field}Zh`] as string | null | undefined,
  });
}

/**
 * The Prisma `select` fragment for a translated field.
 *
 * Spread into a select so a page asks for all four columns without writing
 * them out — and, more usefully, so adding a language later is one edit here
 * rather than a hunt through every query in the system.
 */
export function selectText(field: string) {
  return {
    [field]: true,
    [`${field}En`]: true,
    [`${field}Zh`]: true,
    [`${field}Lang`]: true,
  } as const;
}
