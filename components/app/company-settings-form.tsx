"use client";

import { useActionState, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveCompanySettings } from "@/lib/actions/company-settings";
import type { CompanySettings } from "@/lib/company-settings";
import type { ActionResult } from "@/lib/actions/types";

/**
 * What every customer is told, in one form.
 *
 * These fields appear on invoices, PDFs, WhatsApp messages and the public site
 * at the same moment, so this is the most consequential screen in the app for
 * its size. It is built to be read before it is edited: the label a customer
 * will see is shown as they type it, because "MIX BY YAS — LIPA NUMBER" and
 * "Mixx" are the difference between a payment arriving and not.
 *
 * Editing an account does NOT touch invoices already raised. Each one carries
 * the accounts it was issued with, so last year's PDF still prints last year's
 * numbers. That is stated on the page rather than left to be discovered.
 */
export function CompanySettingsForm({ initial }: { initial: CompanySettings }) {
  const t = useT();
  const [state, action] = useActionState<ActionResult, FormData>(
    saveCompanySettings,
    { ok: true }
  );
  const [settings, setSettings] = useState<CompanySettings>(initial);

  const setAccount = (index: number, patch: Partial<CompanySettings["accounts"][number]>) =>
    setSettings((s) => ({
      ...s,
      accounts: s.accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));

  const setOffice = (
    which: "dar" | "china",
    patch: Partial<CompanySettings["dar"]>
  ) => setSettings((s) => ({ ...s, [which]: { ...s[which], ...patch } }));

  return (
    <form action={action} className="space-y-8">
      {/* One field carries the lot: the shape is nested and a flat FormData
          would have to be reassembled on the server, where a mistake becomes a
          wrong account number rather than a type error. */}
      <input type="hidden" name="payload" value={JSON.stringify(settings)} />

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">
              {t("Collection accounts")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                "Printed on every invoice and in every payment message. The label is what the customer reads — say which service and what kind of number, never just the brand."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSettings((s) => ({
                ...s,
                accounts: [
                  ...s.accounts,
                  { label: "", number: "", accountName: "", kind: "MOBILE" },
                ],
              }))
            }
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Add an account")}
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {settings.accounts.map((account, index) => (
            <li key={index} className="rounded-xl border bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_1fr_1.2fr_auto_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("Label the customer sees")}
                  </Label>
                  <Input
                    value={account.label}
                    onChange={(e) => setAccount(index, { label: e.target.value })}
                    placeholder="MIX BY YAS — LIPA NUMBER"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("Number")}</Label>
                  <Input
                    value={account.number}
                    onChange={(e) => setAccount(index, { number: e.target.value })}
                    className="money-input h-10 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("Account name")}</Label>
                  <Input
                    value={account.accountName}
                    onChange={(e) =>
                      setAccount(index, { accountName: e.target.value })
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("Kind")}</Label>
                  <NativeSelect
                    value={account.kind}
                    onChange={(e) =>
                      setAccount(index, {
                        kind: e.target.value as "MOBILE" | "BANK",
                      })
                    }
                    className="h-10 w-[7rem]"
                  >
                    <option value="MOBILE">{t("Mobile")}</option>
                    <option value="BANK">{t("Bank")}</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("Currency")}</Label>
                  <NativeSelect
                    value={account.currency ?? ""}
                    onChange={(e) =>
                      setAccount(index, {
                        currency: (e.target.value || undefined) as
                          | "TZS"
                          | "USD"
                          | undefined,
                      })
                    }
                    className="h-10 w-[6rem]"
                  >
                    <option value="">—</option>
                    <option value="TZS">TZS</option>
                    <option value="USD">USD</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                {/* What this becomes in a customer's WhatsApp, as it is typed. */}
                <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {account.label || "…"} · {account.number || "…"} ·{" "}
                  {account.accountName || "…"}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      accounts: s.accounts.filter((_, i) => i !== index),
                    }))
                  }
                  className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("Remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(["dar", "china"] as const).map((which) => (
          <section key={which} className="panel p-5">
            <h2 className="font-display font-semibold">
              {which === "dar" ? t("Tanzania office") : t("China office")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                "One line per line of the address, as it would be written on an envelope."
              )}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">{t("City")}</Label>
                <Input
                  value={settings[which].city}
                  onChange={(e) => setOffice(which, { city: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Country")}</Label>
                <Input
                  value={settings[which].country}
                  onChange={(e) => setOffice(which, { country: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Flag")}</Label>
                <Input
                  value={settings[which].flag}
                  onChange={(e) => setOffice(which, { flag: e.target.value })}
                  className="h-10 w-[4.5rem] text-center"
                />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Label className="text-xs">{t("Address lines")}</Label>
              <textarea
                value={settings[which].lines.join("\n")}
                onChange={(e) =>
                  setOffice(which, {
                    lines: e.target.value.split("\n").filter((l) => l.trim()),
                  })
                }
                rows={4}
                className="focus-ring w-full rounded-md border bg-background p-3 text-sm"
              />
            </div>
          </section>
        ))}
      </div>

      <section className="panel p-5">
        <h2 className="font-display font-semibold">{t("Contact")}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["phone", "Phone"],
              ["phoneAlt", "Second phone"],
              ["whatsapp", "WhatsApp (digits only)"],
              ["email", "Email"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{t(label)}</Label>
              <Input
                value={settings.contact[key]}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    contact: { ...s.contact, [key]: e.target.value },
                  }))
                }
                className="h-10"
              />
            </div>
          ))}
        </div>
      </section>

      <FormError state={state} />
      <FormSuccess
        message={
          state.ok && state !== undefined && !("error" in state)
            ? null
            : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton variant="brand" pendingLabel={t("Saving…")}>
          {t("Save settings")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setSettings(initial)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("Undo my changes")}
        </button>
        <p className="text-xs text-muted-foreground">
          {t(
            "Invoices already raised keep the accounts they were issued with — this changes what goes out from now on."
          )}
        </p>
      </div>
    </form>
  );
}
