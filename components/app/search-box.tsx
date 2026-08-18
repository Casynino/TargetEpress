"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Suggestion = {
  /** What goes into the box when this is picked. */
  value: string;
  /** The line a person reads — usually the customer or the document. */
  label: string;
  /** The second line: tracking number, amount, whatever tells two apart. */
  hint?: string;
};

/**
 * A search box that shows you what it can find, while you type.
 *
 * Typing blind into a box and pressing Search is a guess: you find out whether
 * the spelling was right only after the page reloads, and a customer saved as
 * "Mama Grace K." is unfindable by somebody typing "mama grace k" and getting
 * nothing. Offering the matches as you type turns the same box into a list you
 * pick from — which is what somebody with a customer on the phone actually
 * wants, because they are recognising a name, not recalling one.
 *
 * THE SUGGESTIONS ARE THE PAGE'S OWN ROWS, handed in as a prop. No API call, no
 * debounce, no loading state: the data is already on the screen, so matching
 * against it is instant and can never disagree with what the list shows. Pages
 * whose data does not all fit — every customer ever, say — pass the slice they
 * hold and the box stays honest about being a shortcut rather than an index.
 *
 * Keyboard first, because this is used by people who type fast: up and down move,
 * Enter picks, Escape closes without losing what was typed.
 */
export function SearchBox({
  name = "q",
  defaultValue = "",
  placeholder,
  suggestions,
  /** Rendered inside the form, e.g. the hidden field carrying the active chip. */
  children,
  className,
}: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  suggestions: Suggestion[];
  children?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (needle.length < 1) return [];
    const seen = new Set<string>();
    return suggestions
      .filter((s) => {
        const hay = `${s.label} ${s.hint ?? ""} ${s.value}`.toLowerCase();
        if (!hay.includes(needle)) return false;
        /* One row per thing. The same customer can own six consignments, and six
           identical lines is a list nobody reads. */
        const key = s.value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [value, suggestions]);

  const pick = (s: Suggestion) => {
    setValue(s.value);
    setOpen(false);
    /* Submitted for them. Picking a name and then having to press Search is a
       second decision about something already decided. */
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  return (
    <form
      ref={formRef}
      method="GET"
      className={cn("relative flex flex-wrap items-center gap-2", className)}
      onSubmit={() => setOpen(false)}
    >
      {children}

      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          name={name}
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-autocomplete="list"
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setCursor(-1);
          }}
          onFocus={() => setOpen(true)}
          /* A click on a suggestion blurs the input first, so closing waits a
             beat — otherwise the list disappears out from under the pointer. */
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!open || matches.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => (c + 1) % matches.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => (c <= 0 ? matches.length - 1 : c - 1));
            } else if (event.key === "Enter" && cursor >= 0) {
              event.preventDefault();
              pick(matches[cursor]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="h-9 pl-8 text-sm"
        />

        {open && matches.length > 0 ? (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg"
          >
            {matches.map((s, i) => (
              <li key={`${s.value}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(s)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors",
                    i === cursor ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <span className="min-w-0 truncate text-sm">{s.label}</span>
                  {s.hint ? (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {s.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <button
        type="submit"
        className="focus-ring h-9 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent"
      >
        {t("Search")}
      </button>
    </form>
  );
}
