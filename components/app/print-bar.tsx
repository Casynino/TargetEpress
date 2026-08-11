import Link from "next/link";
import { Download } from "lucide-react";

import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { pageRule } from "@/lib/print";

/**
 * Print it, or download it. Nothing else.
 *
 * This bar carried a format toggle and a paragraph about millimetres and
 * sheets-per-A4. Both are gone: there is one card size, so a choice was only a
 * way to get it wrong, and somebody printing forty labels does not want to read
 * about stock dimensions first — the size is a property of the paper in the
 * machine, not a decision to make each time.
 *
 * Download exists because a print dialog produces nothing you can send. Finance
 * forwards a pickup slip on WhatsApp; China keeps a label to reprint when one
 * peels off a carton in the rain.
 */
export function PrintBar({
  item,
  printLabel,
  downloadHref,
  downloadLabel = "Download PDF",
  hint,
}: {
  item: { width: number; height: number };
  printLabel: string;
  /** The route that returns the same card as a PDF. */
  downloadHref: string;
  downloadLabel?: string;
  /** One short sentence about the job — never about the paper. */
  hint?: string;
}) {
  return (
    <>
      {/*
        Rendered into the document rather than a stylesheet: this is the only
        @page rule on the route, so the printer gets this card and no other.
      */}
      <style>{pageRule(item)}</style>

      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <PrintButton label={printLabel} />
        <Button asChild variant="outline" className="h-11">
          {/* A plain link, so the browser saves it the way it saves everything
              else — no fetch, no blob, nothing to go wrong on a warehouse phone
              with a patchy connection. */}
          <Link href={downloadHref} prefetch={false}>
            <Download className="mr-2 h-4 w-4" />
            {downloadLabel}
          </Link>
        </Button>
        {hint ? (
          <p className="w-full text-xs text-muted-foreground sm:w-auto">
            {hint}
          </p>
        ) : null}
      </div>
    </>
  );
}
