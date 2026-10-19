"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Trash2, UserCheck, UserX } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Initials } from "@/components/developer/home-sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeCustomer, setCustomerSuspended } from "@/lib/actions/customers";
import type { ActionResult } from "@/lib/actions/types";

type Found = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  suspended: boolean;
  cargo: number;
  bills: number;
  payments: number;
};

/**
 * Customers matching what was typed in the page's one search box, listed under
 * it the way the staff rows are. They are found, not listed up front: there are
 * far too many to scroll, and a name, a phone number or a customer code is how
 * anybody finds one. Two characters start the search. Suspend and Delete are
 * each one popup with a Confirm; nothing is typed.
 */
export function CustomerResults({
  q,
  onCount,
  onLoading,
}: {
  q: string;
  /** How many customers match, or null while the search is too short to run. */
  onCount: (count: number | null) => void;
  onLoading: (loading: boolean) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<Found[]>([]);
  const [total, setTotal] = useState(0);
  const [live, setLive] = useState(false);

  const search = useCallback(
    async (text: string) => {
      const needle = text.trim();
      if (needle.length < 2) {
        setLive(false);
        setRows([]);
        onCount(null);
        return;
      }
      onLoading(true);
      try {
        const res = await fetch(
          `/api/developer/customers?q=${encodeURIComponent(needle)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as {
          customers?: Found[];
          total?: number;
        };
        const found = body.customers ?? [];
        setRows(found);
        setTotal(body.total ?? found.length);
        setLive(true);
        onCount(body.total ?? found.length);
      } catch {
        setRows([]);
        setLive(true);
        onCount(0);
      } finally {
        onLoading(false);
      }
    },
    [onCount, onLoading],
  );

  useEffect(() => {
    const timer = setTimeout(() => void search(q), 250);
    return () => clearTimeout(timer);
  }, [q, search]);

  if (!live || rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-lg font-semibold leading-tight">
        {t("Customers")}{" "}
        <span className="font-normal text-muted-foreground">· {total}</span>
      </h2>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <CustomerRow key={c.id} c={c} onChanged={() => search(q)} />
            ))}
          </ul>
        </CardContent>
      </Card>
      {total > rows.length ? (
        <p className="px-1 text-sm text-muted-foreground">
          Showing the first {rows.length} of {total}. Type more of the name or
          number to narrow it.
        </p>
      ) : null}
    </section>
  );
}

function CustomerRow({ c, onChanged }: { c: Found; onChanged: () => void }) {
  const t = useT();
  const [popup, setPopup] = useState<"suspend" | "delete" | null>(null);
  const [suspendState, suspendAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(setCustomerSuspended, undefined);
  const [removeState, removeAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(removeCustomer, undefined);

  useEffect(() => {
    if (suspendState?.ok || removeState?.ok) {
      setPopup(null);
      onChanged();
    }
    // onChanged is a fresh closure each render; the states are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspendState, removeState]);

  const holds = [
    c.cargo
      ? `${c.cargo} ${c.cargo === 1 ? "cargo record" : "cargo records"}`
      : null,
    c.bills ? `${c.bills} ${c.bills === 1 ? "bill" : "bills"}` : null,
    c.payments
      ? `${c.payments} ${c.payments === 1 ? "payment" : "payments"}`
      : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <Initials name={c.name} className="size-12 text-sm" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{c.name}</span>
            {c.suspended ? (
              <Badge variant="destructive">{t("Suspended")}</Badge>
            ) : (
              <span className="text-xs font-medium text-success">
                {t("Active")}
              </span>
            )}
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {t("Customer")}
            </span>
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[c.phone ?? t("No number on file"), c.code, c.city]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {holds.length > 0 ? holds.join(" · ") : t("Nothing recorded yet")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setPopup("suspend")}
        >
          {c.suspended ? (
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <UserX className="mr-1.5 h-3.5 w-3.5" />
          )}
          {c.suspended ? t("Reactivate") : t("Suspend")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setPopup("delete")}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("Delete")}
        </Button>
      </div>

      <Dialog open={popup !== null} onOpenChange={(o) => !o && setPopup(null)}>
        <DialogContent className="max-w-sm">
          {popup === "delete" ? (
            <form action={removeAction} className="space-y-4">
              <input type="hidden" name="customerId" value={c.id} />
              <DialogHeader>
                <DialogTitle>
                  {t("Delete")} {c.name}?
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "They leave the customer list and search, and their phone numbers are freed. Their cargo, bills and payments stay on record under their name, and any money they owe stays in Finance.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <FormError state={removeState} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPopup(null)}
                >
                  {t("Cancel")}
                </Button>
                <SubmitButton
                  variant="destructive"
                  className="flex-1"
                  pendingLabel={t("Deleting…")}
                >
                  {t("Confirm")}
                </SubmitButton>
              </div>
            </form>
          ) : popup === "suspend" ? (
            <form action={suspendAction} className="space-y-4">
              <input type="hidden" name="customerId" value={c.id} />
              <input
                type="hidden"
                name="suspend"
                value={c.suspended ? "0" : "1"}
              />
              <DialogHeader>
                <DialogTitle>
                  {c.suspended ? t("Reactivate") : t("Suspend")} {c.name}?
                </DialogTitle>
                <DialogDescription>
                  {c.suspended
                    ? t(
                        "Staff can register cargo for them and hand over their goods again.",
                      )
                    : t(
                        "Staff cannot register new cargo for them or hand over their goods until you reactivate. Their bills and payments are not touched.",
                      )}
                </DialogDescription>
              </DialogHeader>
              <FormError state={suspendState} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPopup(null)}
                >
                  {t("Cancel")}
                </Button>
                <SubmitButton className="flex-1" pendingLabel={t("Working…")}>
                  {t("Confirm")}
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
