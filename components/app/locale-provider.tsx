"use client";

import { createContext, useContext, useMemo } from "react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

/**
 * The reader's language, for components that run in the browser.
 *
 * Server components resolve this themselves with `viewerLocale()`, which reads
 * the user row. A client component cannot — it has no database and no session —
 * so the shell reads the locale once per request and publishes it here.
 *
 * Defaults to English rather than throwing when a component renders outside the
 * shell (a dialog portal, a test, a preview). A screen in the wrong language is
 * a nuisance; a screen that crashes because a provider was missing is an outage.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The locale this component is being read in. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * `const t = useT()`, then `t("Receive Cargo")`.
 *
 * Deliberately the same shape as the server-side `t()` minus the locale
 * argument, so a component moved between the server and the browser keeps its
 * call sites unchanged.
 */
export function useT(): (text: string) => string {
  const locale = useContext(LocaleContext);
  return useMemo(() => (text: string) => t(locale, text), [locale]);
}
