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
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const locale = await viewerLocale();
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
      <Button type="submit">{t(locale, "Search")}</Button>
    </form>
  );
}
