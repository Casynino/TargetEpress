"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Plus, Star, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCustomerPhone, updateCustomerPhone } from "@/lib/actions/customers";

export type CustomerNumber = {
  phone: string;
  isPrimary: boolean;
  label: string | null;
};

/**
 * EVERY NUMBER ONE CUSTOMER USES.
 *
 * A customer registers cargo from whichever SIM is in their hand, and the phone
 * is the only key this system matches them on — so a second number used to make
 * a second customer with the same name and half the balance. Lily Mike had two
 * accounts and was told she owed a third of what she owed.
 *
 * The main number is the one staff ring and the one printed on paperwork. The
 * others exist so cargo sent from them finds the right person, which is the
 * whole job. Adding one is deliberate and does not displace the main number:
 * that is its own decision, not a side effect of recording another SIM.
 */
export function CustomerPhones({
  customerId,
  numbers,
  canEdit,
}: {
  customerId: string;
  numbers: CustomerNumber[];
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      setAdding(false);
      setPhone("");
      setLabel("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4" />
          {t("Their numbers")}
        </h2>
        {canEdit && !adding ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("Add a number")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {numbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("No number on file. Cargo cannot be registered against them until there is one.")}
        </p>
      ) : (
        <ul className="divide-y">
          {numbers.map((number) => (
            <li
              key={number.phone}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="min-w-0">
                <span className="block font-mono text-sm">{number.phone}</span>
                <span className="text-xs text-muted-foreground">
                  {number.isPrimary ? t("Main number") : number.label || t("Also theirs")}
                </span>
              </span>
              {canEdit ? (
                <span className="flex shrink-0 items-center gap-1">
                  {number.isPrimary ? null : (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            updateCustomerPhone({
                              customerId,
                              phone: number.phone,
                              action: "primary",
                            })
                          )
                        }
                        className="focus-ring inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent/40"
                      >
                        <Star className="h-3 w-3" />
                        {t("Make main")}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`${t("Remove")} ${number.phone}`}
                        onClick={() =>
                          run(() =>
                            updateCustomerPhone({
                              customerId,
                              phone: number.phone,
                              action: "remove",
                            })
                          )
                        }
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-4 space-y-2 border-t pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+255 7XX XXX XXX"
              inputMode="tel"
              autoComplete="off"
              aria-label={t("Phone number")}
            />
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("Whose line is it? (optional)")}
              autoComplete="off"
              aria-label={t("Whose line is it? (optional)")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Cargo sent from this number will find this customer. It cannot already belong to somebody else."
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || phone.trim().length < 7}
              onClick={() =>
                run(() => addCustomerPhone({ customerId, phone, label }))
              }
            >
              {pending ? t("Adding…") : t("Add it")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setPhone("");
                setLabel("");
                setError(null);
              }}
            >
              {t("Cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
