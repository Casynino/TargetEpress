"use client";

import { useActionState, useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteCargo, purgeCargo, restoreCargo } from "@/lib/actions/cargo-admin";

/**
 * Deleting a piece of cargo.
 *
 * The reason is required and is kept forever, because the useful question six
 * months later is never "was it deleted" but "why". Nothing is destroyed: the
 * row, its photos and its history survive, and an admin can put it back.
 */
export function DeleteCargoForm({
  shipmentId,
  trackingNumber,
  photoCount,
}: {
  shipmentId: string;
  trackingNumber: string;
  photoCount: number;
}) {
  const t = useT();
  const [state, action] = useActionState(deleteCargo, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok && state.data) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <p className="font-medium">
          {state.data.trackingNumber} {t("deleted.")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t(
            "It is out of every list and the customer can no longer track it. An admin can restore it from Deleted records."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="flex items-center gap-2 font-medium text-destructive">
            <Trash2 className="h-4 w-4" />
            {t("Delete this cargo")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("Hidden everywhere, but kept on the record with its photos.")}
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {open ? t("Cancel") : t("Delete")}
        </span>
      </button>

      {open ? (
        <form action={action} className="mt-4 space-y-3 border-t pt-4">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <FormError state={state} />

          <div className="space-y-1.5">
            <Label htmlFor="reason">{t("Why is it being deleted?")}</Label>
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              placeholder={t(
                "e.g. Duplicate entry — same carton recorded twice"
              )}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("Kept permanently against")} {trackingNumber}.
            </p>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {photoCount > 0
              ? `${photoCount} ${t(photoCount === 1 ? "photo" : "photos")} ${t("will be preserved and stay viewable by an admin.")}`
              : t("Nothing is destroyed — the record and its history are kept.")}
          </p>

          <SubmitButton variant="destructive" pendingLabel="Deleting…">
            <Trash2 className="mr-2 h-4 w-4" />
            {t("Delete")} {trackingNumber}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/** Puts a deleted piece of cargo back, from the admin's deleted-records screen. */
export function RestoreCargoButton({
  shipmentId,
  trackingNumber,
}: {
  shipmentId: string;
  trackingNumber: string;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await restoreCargo(shipmentId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {t("Restore")} {trackingNumber}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{t(error)}</span>
      ) : null}
    </span>
  );
}


/**
 * Erasing a record for good.
 *
 * Everything else in this system is reversible; this is not. So it is folded
 * shut by default, it states plainly what will be destroyed, and it will not
 * proceed until the tracking number has been typed out in full. That last step
 * is the whole safety mechanism — it is the difference between removing the
 * record you are looking at and the one you meant.
 */
export function PurgeCargoForm({
  shipmentId,
  trackingNumber,
  photoCount,
  packageCount,
}: {
  shipmentId: string;
  trackingNumber: string;
  photoCount: number;
  packageCount: number;
}) {
  const t = useT();
  const [state, action] = useActionState(purgeCargo, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok && state.data) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
        {state.data.trackingNumber}{" "}
        {t("has been permanently removed. Only the audit entry remains.")}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-destructive hover:underline"
      >
        {open ? t("Cancel") : t("Remove permanently")}
      </button>

      {open ? (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <FormError state={state} />

          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-medium text-destructive">
              {t("This cannot be undone.")}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("The record, its")} {packageCount}{" "}
              {t(packageCount === 1 ? "package" : "packages")} {t("and")}{" "}
              {photoCount} {t(photoCount === 1 ? "photo" : "photos")}{" "}
              {t(
                "will be destroyed. The customer will no longer be able to track it. Only the audit entry survives."
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`confirm-${shipmentId}`} className="text-xs">
              {t("Type")} {trackingNumber} {t("to confirm")}
            </Label>
            <input
              id={`confirm-${shipmentId}`}
              name="confirm"
              required
              autoComplete="off"
              placeholder={trackingNumber}
              className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs uppercase tabular outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            />
          </div>

          <SubmitButton size="sm" variant="destructive" pendingLabel="Removing…">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t("Remove permanently")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The same deletion, reachable where the mistake is noticed.
 *
 * The owner: "deleting the cargo should not be complicated or hidden for the
 * china warehouse, since she is the one putting the cargo in — mistakes happen.
 * It should be as easy to delete as to edit." The form above lived at the foot
 * of the EDIT page, which meant Maggie had to know deletion was a kind of
 * editing to ever find it. This is the same action as a header button — beside
 * Edit on the cargo page, and on the just-registered screen where the label is
 * printed — opening over the page in the house dialog pattern.
 *
 * The guardrails are the server's, unchanged: only cargo still in China, only
 * with a reason, never destroying the record.
 */
export function CargoDeleteButton({
  shipmentId,
  trackingNumber,
  /** Where to go once it is gone — this page is about to stop existing. */
  backHref,
  backLabel,
}: {
  shipmentId: string;
  trackingNumber: string;
  backHref: string;
  backLabel: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteCargo, undefined);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" />
        {t("Delete")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${t("Delete")} ${trackingNumber}`}
          onClick={(event) => {
            if (event.target === event.currentTarget && !state?.ok) setOpen(false);
          }}
        >
          <div className="mx-auto max-w-md">
            <div className="rounded-xl border bg-card p-4 shadow-lift">
              {state?.ok && state.data ? (
                <div className="text-sm">
                  <p className="font-medium">
                    {state.data.trackingNumber} {t("deleted.")}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t(
                      "It is out of every list and the customer can no longer track it. An admin can restore it from Deleted records."
                    )}
                  </p>
                  <a
                    href={backHref}
                    className="focus-ring mt-4 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
                  >
                    {backLabel}
                  </a>
                </div>
              ) : (
                <form action={action} className="space-y-3">
                  <input type="hidden" name="shipmentId" value={shipmentId} />
                  <p className="flex items-center gap-2 font-medium text-destructive">
                    <Trash2 className="h-4 w-4" />
                    {t("Delete this cargo")} · {trackingNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Hidden everywhere, but kept on the record with its photos.")}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="quickDeleteReason">
                      {t("Why is it being deleted?")}
                    </Label>
                    <Textarea
                      id="quickDeleteReason"
                      name="reason"
                      rows={2}
                      required
                      placeholder={t("e.g. Duplicate entry — same carton recorded twice")}
                    />
                  </div>
                  <FormError state={state} />
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton
                      className="bg-destructive text-white hover:bg-destructive/90"
                      pendingLabel={t("Deleting…")}
                    >
                      {t("Delete it")}
                    </SubmitButton>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="focus-ring inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
