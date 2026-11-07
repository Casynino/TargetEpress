"use client";

import { useTransition } from "react";

import { useT } from "@/components/app/locale-provider";
import { setLanguage } from "@/lib/actions/language";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * English or 中文, for the desk that needs it.
 *
 * Two buttons rather than a dropdown. There are exactly two languages and the
 * switch is pressed by somebody who cannot currently read the interface — a
 * closed menu labelled in the language they do not speak is the one control
 * that must never hide behind another one.
 *
 * Each label is written in its own language, for the same reason: "中文" is
 * legible to the person who needs it whatever the interface is currently set
 * to, which "Chinese" would not be.
 */
export function LanguageSwitch({
  current,
  className,
}: {
  current: Locale;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={cn(
        "inline-flex items-center gap-0.5",
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            disabled={pending || active}
            aria-current={active ? "true" : undefined}
            onClick={() => start(() => void setLanguage(locale))}
            className={cn(
              // Drawn for the glass sidebar (.glass-* in globals.css), the
              // only place it lives: no box, the chosen language in gold
              // like the page you are on.
              "focus-ring inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[12.5px] transition-colors disabled:cursor-default lg:min-h-8",
              active ? "g-gold font-semibold" : "g-soft g-hover font-medium"
            )}
          >
            {LOCALE_LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
