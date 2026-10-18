"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, ShieldAlert, Users } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

function SubmitButton({ developer }: { developer: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="brand"
      className={cn(
        "w-full",
        /* A different colour for a different account, on the one control a
           person presses without reading. */
        developer && "bg-violet-600 hover:bg-violet-500 focus-visible:ring-violet-400"
      )}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("Signing in…")}
        </>
      ) : developer ? (
        t("Sign in as Developer")
      ) : (
        t("Sign in")
      )}
    </Button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useT();
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {}
  );
  /* Staff by default: this is the door nearly everybody uses, and a page that
     opened on the other one would be asking them to find theirs. */
  const [mode, setMode] = useState<"staff" | "developer">("staff");
  const developer = mode === "developer";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <input type="hidden" name="accountType" value={mode} />

      {/* Two doors, both always visible. A choice hidden behind a link or a
          query string is a choice somebody finds by accident. */}
      <div
        role="group"
        aria-label={t("Account type")}
        className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1"
      >
        {(
          [
            ["staff", t("Staff login"), Users],
            ["developer", t("Developer login"), ShieldAlert],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "focus-ring flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === value
                ? value === "developer"
                  ? "bg-violet-600 text-white"
                  : "bg-white/15 text-white"
                : "text-white/55 hover:text-white"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {developer ? (
        <p className="flex items-start gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 p-3 text-xs leading-relaxed text-violet-100">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(
            "Developer sign-in uses your developer credentials, not your staff ones. Everything you do is recorded under the Developer account. A forgotten password is recovered through the secure setup process; the CEO cannot reset it."
          )}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">{t("Work email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder={developer ? "developer@…" : "you@targetexpress.co.tz"}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("Password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(state.error)}</span>
        </div>
      ) : null}

      <SubmitButton developer={developer} />
    </form>
  );
}
