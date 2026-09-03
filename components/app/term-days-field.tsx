"use client";

import { useState } from "react";

import { useT } from "@/components/app/locale-provider";
import {
  CREDIT_TERMS,
  CREDIT_TERM_MAX,
  CREDIT_TERM_MIN,
} from "@/lib/credit";

const control =
  "focus-ring h-8 rounded-md border bg-card px-2 text-xs";

/**
 * How many days the customer is being given.
 *
 * Seven, fourteen and thirty were the only three the system would take, and a
 * customer who negotiated forty-five had to be written down as thirty — a due
 * date the company never agreed to, and the credit engine then chased them on
 * it. The three stay as the shortcuts they always were; "Another number of
 * days" opens a box for everything else.
 *
 * One component for all four places terms are set — asked for, granted,
 * adjusted, and set as a customer's default — because four selects meant four
 * chances for one of them to keep the old limit.
 */
export function TermDaysField({
  name = "termDays",
  defaultValue,
  emptyLabel,
}: {
  name?: string;
  /** The term already agreed, or empty where none is being set. */
  defaultValue: string;
  /**
   * Offered as the first option when terms are optional here — the credit
   * adjuster sets a date directly and leaves the term alone.
   */
  emptyLabel?: string;
}) {
  const t = useT();
  const preset =
    defaultValue === "" ||
    (CREDIT_TERMS as readonly number[]).includes(Number(defaultValue));
  const [custom, setCustom] = useState(!preset);
  const [days, setDays] = useState(defaultValue);

  if (custom) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="number"
          name={name}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          min={CREDIT_TERM_MIN}
          max={CREDIT_TERM_MAX}
          step={1}
          required
          autoFocus
          aria-label={t("Days")}
          className={`${control} w-20`}
        />
        <span className="text-[11px] text-muted-foreground">{t("days")}</span>
        {/* Back to the shortcuts. Without this the box is a one-way door and
            somebody who opened it by mistake has to reload the page. */}
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            setDays(defaultValue);
          }}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("back")}
        </button>
      </span>
    );
  }

  return (
    <select
      name={name}
      value={days}
      onChange={(event) => {
        if (event.target.value === "custom") {
          setCustom(true);
          return;
        }
        setDays(event.target.value);
      }}
      className={control}
    >
      {emptyLabel ? <option value="">{emptyLabel}</option> : null}
      {CREDIT_TERMS.map((d) => (
        <option key={d} value={d}>
          {d} {t("days")}
        </option>
      ))}
      <option value="custom">{t("Another number of days…")}</option>
    </select>
  );
}
