"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { fillMissingInvoiceRates } from "@/lib/actions/pricing";

/**
 * "Some bills carry no exchange rate."
 *
 * Shows itself only when there are any, and takes itself away when there are
 * none — this is a repair, not a feature, and a button for a job that is
 * finished is a button somebody presses by mistake.
 *
 * Counts on load rather than waiting to be asked: the desk cannot go looking
 * for a fault it has no way of seeing, and a bill with no rate looks perfectly
 * normal until somebody tries to take shillings for it.
 */
export function FillInvoiceRates() {
  const t = useT();
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [noRateBook, setNoRateBook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    fillMissingInvoiceRates({ preview: true }).then((result) => {
      if (!alive || !result.ok) return;
      setCount(result.data?.filled ?? 0);
      setNoRateBook(result.data?.noRateBook ?? false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-warning">
        <AlertTriangle className="h-4 w-4" />
        {t("{n} bill(s) carry no exchange rate").replace("{n}", String(count))}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t(
          "They were raised before a rate was published, so they cannot be stated in shillings — the counter cannot take a shilling payment for them. Filling it in changes nothing anybody owes: the dollar total is untouched, and each bill takes the rate that was published on the day it was raised."
        )}
      </p>

      {error ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {noRateBook ? (
        <p className="text-sm text-destructive">
          {t("No rate has ever been published. Set one above first.")}
        </p>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await fillMissingInvoiceRates({ preview: false });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setCount(0);
              router.refresh();
            });
          }}
        >
          {pending
            ? t("Filling…")
            : t("Fill the rate on {n} bill(s)").replace("{n}", String(count))}
        </Button>
      )}
    </section>
  );
}
