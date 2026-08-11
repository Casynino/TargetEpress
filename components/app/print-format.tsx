import Link from "next/link";
import { Printer } from "lucide-react";

import { PrintButton } from "@/components/app/print-button";
import { cn } from "@/lib/utils";
import { pageRule, perSheet, type PrintFormat } from "@/lib/print";

/**
 * The page size this print run will use, and the switch between the two.
 *
 * A page size cannot be toggled with a class: `@page` is a document-level
 * at-rule that no selector reaches. So the rule itself is what changes, the
 * route decides which one from the URL, and the choice survives a reload and a
 * bookmark — which matters when the same bench prints the same way every day.
 *
 * Two formats because two kinds of hardware exist. Guangzhou runs a label
 * printer and wants the page cut to the sticker; a Dar office with one A4
 * laser wants eight stickers on a sheet of adhesive paper and a guillotine.
 * Telling either of them to buy the other's printer is not a design.
 */
export function PrintFormatBar({
  format,
  item,
  count,
  noun,
  printLabel,
  hint,
}: {
  format: PrintFormat;
  item: { width: number; height: number };
  /** How many things are about to print, for the sheet arithmetic. */
  count: number;
  /** "label" / "pickup note", singularised by the caller's noun. */
  noun: string;
  printLabel: string;
  hint?: string;
}) {
  const sheet = perSheet(item);
  const sheets = Math.ceil(count / sheet.total);

  return (
    <>
      {/*
        Rendered into the document, not a stylesheet. React hoists it to the
        head, and it is the only `@page` rule on the route — so whichever
        format the URL asked for is unambiguously the one the printer gets.
      */}
      <style>{pageRule(format, item)}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            role="group"
            aria-label="Print format"
            className="inline-flex rounded-lg border p-0.5"
          >
            <FormatChoice
              active={format === "direct"}
              href="?format=direct"
              title={`Needs ${item.width}×${item.height}mm stock loaded`}
            >
              {item.width}×{item.height}mm roll
            </FormatChoice>
            <FormatChoice
              active={format === "sheet"}
              href="?format=sheet"
              title={`${sheet.total} per A4 sheet, ${sheet.cols} across`}
            >
              A4 sheet
            </FormatChoice>
          </div>
          {/*
            Say which paper each choice wants.

            The choice is named for the hardware, and the failure it prevents is
            a paper mismatch: pick the roll size on an office A4 laser and the
            printer lays one small page in the corner of a full sheet — exactly
            the waste this whole change is about — while the screen cheerfully
            says "nothing to cut".
          */}
          <p className="mt-2 text-xs text-muted-foreground">
            {format === "direct" ? (
              <>
                {count} {noun}
                {count === 1 ? "" : "s"} · one per page, nothing to cut.{" "}
                <span className="font-medium text-warning">
                  Only for a printer loaded with {item.width}×{item.height}mm
                  stock — on plain A4, choose A4 sheet.
                </span>
              </>
            ) : (
              <>
                {count} {noun}
                {count === 1 ? "" : "s"} · {sheet.total} per A4 sheet ={" "}
                {sheets} sheet{sheets === 1 ? "" : "s"}. Cut along the borders.
              </>
            )}
            {hint ? ` ${hint}` : ""}
          </p>
        </div>

        <PrintButton label={printLabel} />
      </div>
    </>
  );
}

function FormatChoice({
  active,
  href,
  title,
  children,
}: {
  active: boolean;
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      // Links, not a client toggle. The format is a property of the run, and a
      // run that reloads or gets bookmarked should come back the same shape.
      className={cn(
        "focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-brand text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Printer className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
