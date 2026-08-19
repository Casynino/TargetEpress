"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A box for typing money in, grouped as you type.
 *
 * Shillings run to seven and eight digits. Unseparated, 2000000 and 20000000
 * are the same shape, and the only way to tell them apart is to count the
 * noughts with a fingertip on the screen — which is exactly what people do, and
 * exactly how a cost gets recorded ten times too large.
 *
 * The grouping is a reading aid and nothing more. Every server action here
 * parses its amount with Number(), and Number("2,000,000") is NaN, so what is
 * shown and what is submitted cannot be the same string: the visible box carries
 * the commas and no name, and a hidden field carries the bare digits under the
 * name the action expects. Nothing on the server side changed for this.
 */

/**
 * Digits and at most one decimal point — what the server will parse.
 *
 * A typed comma is dropped rather than read as a decimal mark: this app formats
 * in the en-US convention throughout, so in "1,5" the comma is a half-typed
 * thousand, not a half.
 */
function toRaw(text: string, decimals: number, allowNegative = false) {
  let out = "";
  let seenPoint = false;
  let places = 0;

  /*
    A MINUS SIGN, WHERE A MINUS SIGN IS A REAL ANSWER.

    Kept out by default, because a payment of minus five thousand is a typo and
    every other box in this app takes money that only goes one way. It is opt-in
    for the one figure that legitimately runs negative: the balance an account
    ACTUALLY holds. Three of this company's six accounts are overdrawn today,
    and a form that cannot type their true balance is a control nobody can use.
  */
  if (allowNegative && text.trimStart().startsWith("-")) out = "-";

  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      if (seenPoint) {
        if (places >= decimals) continue;
        places += 1;
      }
      out += ch;
      continue;
    }
    if (ch === "." && !seenPoint && decimals > 0) {
      seenPoint = true;
      out += ".";
    }
  }

  // 007 is 7. The lookahead spares the nought in 0.5, and the minus is stepped
  // over so -007 becomes -7 rather than being left alone.
  return out.startsWith("-")
    ? `-${out.slice(1).replace(/^0+(?=\d)/, "")}`
    : out.replace(/^0+(?=\d)/, "");
}

/** The same figure with thousands separators. Only the whole part groups. */
function group(raw: string): string {
  if (raw === "") return "";
  if (raw === "-") return "-";
  if (raw.startsWith("-")) return `-${group(raw.slice(1))}`;
  const point = raw.indexOf(".");
  const whole = point === -1 ? raw : raw.slice(0, point);
  const rest = point === -1 ? "" : raw.slice(point);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + rest;
}

/** How many characters that carry meaning sit before the caret. */
function valueChars(text: string, caret: number) {
  let n = 0;
  for (let i = 0; i < caret && i < text.length; i += 1) {
    if (text[i] !== ",") n += 1;
  }
  return n;
}

/** Where that many meaningful characters lands once the commas are back. */
function caretFor(text: string, count: number) {
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (seen === count) return i;
    if (text[i] !== ",") seen += 1;
  }
  return text.length;
}

export interface MoneyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "type"
  > {
  /** The name the server action reads. Goes on the hidden field. */
  name: string;
  /** Controlled value, always ungrouped: "1234.5", never "1,234.5". */
  value?: string;
  defaultValue?: string | number;
  /** Fires with the ungrouped value, so callers can keep doing Number(v). */
  onValueChange?: (raw: string) => void;
  /** Rates and totals are both money; nothing in this app needs more than 2. */
  decimals?: number;
  /** Let the figure go below zero. Only the account-balance forms need it. */
  allowNegative?: boolean;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      name,
      value,
      defaultValue,
      onValueChange,
      decimals = 2,
      allowNegative = false,
      className,
      onBlur,
      ...props
    },
    forwardedRef
  ) => {
    const [text, setText] = React.useState(() =>
      group(toRaw(String(value ?? defaultValue ?? ""), decimals, allowNegative))
    );
    const raw = toRaw(text, decimals, allowNegative);

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const caretRef = React.useRef<number | null>(null);

    const setRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    /**
     * A controlled caller can write to the box from outside — switching the
     * payment currency restates the amount, and "pay the figure that clears it"
     * fills it in. Resync only when the two genuinely disagree; doing it on
     * every keystroke would fight the caret.
     */
    React.useEffect(() => {
      if (value === undefined) return;
      const incoming = toRaw(value, decimals, allowNegative);
      if (incoming !== raw) setText(group(incoming));
    }, [value, decimals, raw, allowNegative]);

    /**
     * Re-grouping moves every character after the edit, so the browser's own
     * caret is wrong by however many commas appeared or vanished. Put it back
     * before the frame paints, or typing into the middle of a figure throws you
     * to the end of it.
     */
    React.useLayoutEffect(() => {
      const el = inputRef.current;
      if (el && caretRef.current !== null && document.activeElement === el) {
        el.setSelectionRange(caretRef.current, caretRef.current);
      }
      caretRef.current = null;
    });

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      let typed = event.target.value;
      let caret = event.target.selectionStart ?? typed.length;

      /**
       * Backspace over a comma removes only the comma, which we then put
       * straight back — so the key appears to do nothing. Take the digit in
       * front of it instead, which is what the press meant.
       */
      if (
        typed.length < text.length &&
        caret > 0 &&
        toRaw(typed, decimals, allowNegative) === raw
      ) {
        typed = typed.slice(0, caret - 1) + typed.slice(caret);
        caret -= 1;
      }

      const nextRaw = toRaw(typed, decimals, allowNegative);
      const nextText = group(nextRaw);

      caretRef.current = caretFor(nextText, valueChars(typed, caret));
      setText(nextText);
      onValueChange?.(nextRaw);
    };

    /** Tidy the half-typed shapes: "12." is 12, ".5" is 0.5. */
    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const tidy = raw.endsWith(".")
        ? raw.slice(0, -1)
        : raw.startsWith(".")
          ? `0${raw}`
          : raw;
      if (tidy !== raw) {
        setText(group(tidy));
        onValueChange?.(tidy);
      }
      onBlur?.(event);
    };

    return (
      <>
        <Input
          {...props}
          ref={setRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn("money-input h-11 text-base", className)}
        />
        {/* What the action actually reads. Number("2,000,000") is NaN. */}
        <input type="hidden" name={name} value={raw} />
      </>
    );
  }
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
