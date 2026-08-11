"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";

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

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn("inline-flex rounded-lg border p-0.5", className)}
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
              "focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:cursor-default",
              active
                ? "bg-brand text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {locale === "en" ? <Languages className="h-3.5 w-3.5" /> : null}
            {LOCALE_LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
