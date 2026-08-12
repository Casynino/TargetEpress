"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveMarket, setMarketActive } from "@/lib/actions/markets";

export type MarketRow = {
  id: string;
  slug: string;
  name: string;
  nameCn: string | null;
  city: string;
  district: string | null;
  route: string;
  hours: string | null;
  bestFor: string;
  summary: string;
  products: string[];
  tips: string[];
  verify: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * The markets directory, editable.
 *
 * One form, reused for add and edit — a separate "new market" page would be a
 * second place for the same fields to drift out of sync. Products and tips are
 * one-per-line textareas rather than repeatable field rows: the CEO is pasting
 * a list, not operating a form builder.
 */
export function MarketsAdmin({ markets }: { markets: MarketRow[] }) {
  const t = useT();
  const [state, action] = useActionState(saveMarket, undefined);
  const [editing, setEditing] = useState<MarketRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const startEdit = (market: MarketRow | null) => {
    setEditing(market);
    setOpen(true);
    setError(null);
  };

  const toggle = (market: MarketRow) => {
    setError(null);
    startTransition(async () => {
      const result = await setMarketActive(market.id, !market.active);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">
              {open
                ? editing
                  ? t("Edit market")
                  : t("Add a market")
                : t("Markets")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("Shown to the support desk and on the public guide.")}
            </p>
          </div>
          <Button
            type="button"
            variant={open ? "ghost" : "default"}
            size="sm"
            onClick={() => (open ? setOpen(false) : startEdit(null))}
          >
            {open ? t("Close") : <><Plus className="mr-1 h-4 w-4" />{t("New market")}</>}
          </Button>
        </header>

        {open ? (
          // Remount on edit so defaultValue picks up the selected market.
          <form key={editing?.id ?? "new"} action={action} className="space-y-4 p-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormError state={state} />
            {state?.ok ? (
              <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
                {t(
                  "Saved. The public guide updates within the hour, or immediately on the support desk."
                )}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("Market name")}</Label>
                <Input id="name" name="name" defaultValue={editing?.name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameCn">{t("Chinese name")}</Label>
                <Input id="nameCn" name="nameCn" defaultValue={editing?.nameCn ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">{t("City")}</Label>
                <Input id="city" name="city" defaultValue={editing?.city} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="district">{t("District")}</Label>
                <Input
                  id="district"
                  name="district"
                  defaultValue={editing?.district ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="route">{t("Goods fly out of")}</Label>
                <NativeSelect
                  id="route"
                  name="route"
                  defaultValue={editing?.route ?? "GUANGZHOU"}
                >
                  <option value="GUANGZHOU">{t("Guangzhou")}</option>
                  <option value="HONG_KONG">{t("Hong Kong")}</option>
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  {t("This decides what the customer pays to fly it home.")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours">{t("Opening hours")}</Label>
                <Input
                  id="hours"
                  name="hours"
                  defaultValue={editing?.hours ?? ""}
                  placeholder={t("Roughly 09:00–17:00 daily")}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bestFor">{t("Best for — one line")}</Label>
                <Input
                  id="bestFor"
                  name="bestFor"
                  defaultValue={editing?.bestFor}
                  placeholder={t("Clothing, shoes, bags and general merchandise")}
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="summary">{t("Description")}</Label>
                <Textarea
                  id="summary"
                  name="summary"
                  rows={4}
                  defaultValue={editing?.summary}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="products">{t("Products — one per line")}</Label>
                <Textarea
                  id="products"
                  name="products"
                  rows={6}
                  defaultValue={editing?.products.join("\n")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tips">
                  {t("Tips for the customer — one per line")}
                </Label>
                <Textarea
                  id="tips"
                  name="tips"
                  rows={6}
                  defaultValue={editing?.tips.join("\n")}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="verify">
                  {t("Warning to reconfirm")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("optional")}
                  </span>
                </Label>
                <Input
                  id="verify"
                  name="verify"
                  defaultValue={editing?.verify ?? ""}
                  placeholder={t("Opening days vary — confirm before travelling.")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sortOrder">{t("Position in the list")}</Label>
                <Input
                  id="sortOrder"
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(editing?.sortOrder ?? markets.length)}
                />
              </div>
            </div>

            <SubmitButton pendingLabel={t("Saving…")}>
              {editing ? t("Save changes") : t("Add market")}
            </SubmitButton>
          </form>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {markets.map((market) => (
          <article
            key={market.id}
            className={`rounded-xl border bg-card p-5 shadow-soft ${
              market.active ? "" : "opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display font-bold">{market.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {market.city}
                  {market.district ? ` · ${market.district}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {market.route === "HONG_KONG"
                    ? t("Hong Kong")
                    : t("Guangzhou")}
                </Badge>
                {market.active ? null : (
                  <Badge variant="outline">{t("hidden")}</Badge>
                )}
              </div>
            </div>

            <p className="mt-2 text-sm font-medium text-brand">{market.bestFor}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {market.summary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {market.products.length} {t("products")} · {market.tips.length}{" "}
              {t("tips")}
            </p>

            <div className="mt-4 flex gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startEdit(market)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {t("Edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => toggle(market)}
              >
                {market.active ? (
                  <>
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    {t("Hide")}
                  </>
                ) : (
                  <>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {t("Publish")}
                  </>
                )}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
