import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

/**
 * The title bar on every screen, in the reader's language.
 *
 * Async and resolving the locale itself rather than taking it as a prop:
 * fifty-eight pages render this, and threading a locale through every one of
 * them would be fifty-eight chances to forget. A server component can just ask.
 */
export async function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const locale = await viewerLocale();
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t(locale, title)}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, description)}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
