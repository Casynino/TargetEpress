import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

/**
 * One box that finds a consignment however the person on the phone describes it.
 *
 * A plain GET form on purpose: the query ends up in the URL, so a result can be
 * linked to a colleague, bookmarked, and reloaded, and the back button behaves.
 * No state, no hooks — which is why this lives outside support-forms.tsx and
 * its "use client", and never reaches the browser as JavaScript at all.
 *
 * `action` differs by desk because the desks reach different pages: Support has
 * its own search that also covers tickets and sourcing; everyone else uses the
 * cargo search at /app/search. Same box, same behaviour, whichever it posts to.
 */
export async function CargoSearch({
  action,
  defaultValue,
  placeholder,
  compact = false,
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  /** The slim box under a desk's banner. */
  compact?: boolean;
}) {
  const locale = await viewerLocale();

  /*
    UNDER A BANNER it is one slim rounded field with a magnifier and no button
    (the owner, 8 Nov 2026: the wide box with its white button broke the
    design). Enter searches, as it always did; the button is still there for a
    screen reader, just not drawn.
  */
  if (compact) {
    return (
      <form action={action} role="search" className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          defaultValue={defaultValue}
          placeholder={t(locale, placeholder ?? "Tracking number, customer, phone or batch")}
          autoComplete="off"
          aria-label={t(locale, "Search cargo")}
          className="h-10 w-full rounded-full border bg-card pl-10 pr-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/20"
        />
        <button type="submit" className="sr-only">
          {t(locale, "Search")}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="flex gap-2">
      <Input
        name="q"
        defaultValue={defaultValue}
        placeholder={t(
          locale,
          placeholder ?? "Tracking number, customer name, phone, batch or invoice"
        )}
        className="flex-1"
        autoComplete="off"
        aria-label={t(locale, "Search cargo")}
      />
      <Button type="submit">
        {t(locale, "Search")}
      </Button>
    </form>
  );
}
