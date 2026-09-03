"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { mergeCustomers } from "@/lib/actions/customers";

export type MergeCandidate = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  shipments: number;
  invoices: number;
  /** Why this record surfaced, in the words the clerk needs to judge it. */
  reason: string;
};

/**
 * "These two look like the same person."
 *
 * Shown on a customer's own page rather than in a duplicates report, because
 * the moment somebody notices is the moment they are looking at one of them.
 * The list is a suggestion and nothing more — a father and son share a
 * surname, and two shops share a landline — so every row states what it has
 * counted and the clerk decides.
 *
 * Confirming is two deliberate presses, not a typed code.
 *
 * It asked the clerk to copy the losing record's code across, on the argument
 * that reading it is the check. But the code is already on the row above the
 * box, and the desk does this with a customer on the phone — so the typing was
 * a delay rather than a check, and a gate people learn to hurry through is not
 * a gate. The code is filled in and shown, the sentence names both records,
 * and the second press is the decision.
 */
export function CustomerMergePanel({
  keepId,
  keepName,
  candidates,
}: {
  keepId: string;
  keepName: string;
  candidates: MergeCandidate[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (candidates.length === 0) return null;

  function run(candidate: MergeCandidate) {
    setError(null);
    start(async () => {
      const result = await mergeCustomers({
        keepId,
        mergeId: candidate.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setTyped("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 shadow-soft">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Users className="h-4 w-4" />
        {t("Possibly the same customer")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t(
          "Merging moves all their cargo, bills, payments and messages onto this record. Nothing is recalculated and nothing is lost — but it cannot be undone here."
        )}
      </p>

      {error ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{candidate.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {candidate.code}
                  {candidate.phone ? ` · ${candidate.phone}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {candidate.reason} · {candidate.shipments}{" "}
                  {t("cargo")} · {candidate.invoices} {t("bill(s)")}
                </p>
              </div>
              {open === candidate.id ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(candidate.id);
                    /* Filled in, so the press that follows is the decision
                       rather than a typing exercise. */
                    setTyped(candidate.code);
                    setError(null);
                  }}
                >
                  {t("Merge into this customer")}
                </Button>
              )}
            </div>

            {open === candidate.id ? (
              <div className="mt-4 space-y-3 border-t pt-4">
                <p className="text-sm">
                  {t(
                    "Everything belonging to {from} moves to {to}, and {code} is removed. Type the code to confirm."
                  )
                    .replace("{from}", candidate.name)
                    .replace("{to}", keepName)
                    .replace("{code}", candidate.code)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder={candidate.code}
                    className="focus-ring w-40 rounded-lg border bg-background px-3 py-2 font-mono text-sm"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      pending ||
                      typed.trim().toUpperCase() !== candidate.code.toUpperCase()
                    }
                    onClick={() => run(candidate)}
                  >
                    {pending ? t("Merging…") : t("Merge")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpen(null);
                      setTyped("");
                    }}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
