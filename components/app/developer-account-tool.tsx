"use client";

import { useActionState, useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  changeUserRole,
  resetUserPassword,
  setUserActive,
} from "@/lib/actions/users";
import { startWorkingAs } from "@/lib/actions/developer";
import type { ActionResult } from "@/lib/actions/types";
import { DEVELOPER_REASON_MIN } from "@/lib/developer-shared";

type Person = {
  id: string;
  name: string;
  roleKey: string;
  roleLabel: string;
  active: boolean;
};

type Choice = "role" | "active" | "password" | "workas";

/**
 * ONE ACCOUNT CHANGE, SAID OUT LOUD BEFORE IT HAPPENS.
 *
 * The staff screen changes a role on one press of Save, because the people
 * using it are the owner's own staff, acting on a line of work that already
 * asks for nothing more. This one is for the account that can see everything:
 * it first lays out what will change, then asks for the reason, then does it.
 *
 * Three steps rather than a browser confirm() — confirm() is a dialog the page
 * cannot style or test, and it carries no field to write a reason into.
 *
 * The reason is also enforced on the server (lib/developer-shared.ts); asking
 * for it here is what makes the refusal rare rather than the experience.
 */
export function DeveloperAccountTool({
  person,
  roles,
  manage = true,
}: {
  person: Person;
  roles: { value: string; label: string }[];
  /** False for the owner's account: it can be looked as, and nothing else. */
  manage?: boolean;
}) {
  const t = useT();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [newRole, setNewRole] = useState(person.roleKey);
  const [password, setPassword] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const [roleState, roleAction] = useActionState<ActionResult | undefined, FormData>(
    changeUserRole,
    undefined
  );
  const [activeState, activeAction] = useActionState<ActionResult | undefined, FormData>(
    setUserActive,
    undefined
  );
  const [passwordState, passwordAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(resetUserPassword, undefined);

  const [workAsState, workAsAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(startWorkingAs, undefined);

  const reset = () => {
    setChoice(null);
    setReviewed(false);
    setPassword("");
  };

  if (!choice) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {manage ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChoice("role")}>
              {t("Change role")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChoice("active")}>
              {person.active ? t("Suspend") : t("Reactivate")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChoice("password")}>
              {t("Reset password")}
            </Button>
          </>
        ) : null}
        {person.active ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setChoice("workas")}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            {t("Work as")}
          </Button>
        ) : null}
      </div>
    );
  }

  const action =
    choice === "role"
      ? roleAction
      : choice === "active"
        ? activeAction
        : choice === "workas"
          ? workAsAction
          : passwordAction;
  const state =
    choice === "role"
      ? roleState
      : choice === "active"
        ? activeState
        : choice === "workas"
          ? workAsState
          : passwordState;

  const roleLabel = (key: string) => roles.find((r) => r.value === key)?.label ?? key;

  const consequence =
    choice === "workas"
      ? t("Look at the app as {name} ({role}). You see exactly what they see. It is view only: every action is refused and recorded, nothing is changed, and it ends by itself after 4 hours or when you press Stop.")
          .replace("{name}", person.name)
          .replace("{role}", person.roleLabel)
      : choice === "role"
      ? t("Move {name} from {from} to {to}. What they can do changes the next time they load a page.")
          .replace("{name}", person.name)
          .replace("{from}", person.roleLabel)
          .replace("{to}", roleLabel(newRole))
      : choice === "active"
        ? person.active
          ? t("Suspend {name}. They are signed out of everything on their next request and cannot sign in.").replace(
              "{name}",
              person.name
            )
          : t("Reactivate {name}. They can sign in again immediately.").replace(
              "{name}",
              person.name
            )
        : t("Set a new password for {name}. Their old one stops working immediately.").replace(
            "{name}",
            person.name
          );

  const ready =
    choice === "role"
      ? newRole !== person.roleKey
      : choice === "password"
        ? password.length >= 8
        : true;

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-violet-500/40 bg-violet-500/5 p-3 text-left"
    >
      <input type="hidden" name="userId" value={person.id} />
      {choice === "active" ? (
        <input type="hidden" name="active" value={person.active ? "false" : "true"} />
      ) : null}

      {!reviewed ? (
        <>
          {choice === "role" ? (
            <NativeSelect
              name="role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-9 text-sm"
              aria-label={t("New role")}
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          {choice === "password" ? (
            <Input
              name="password"
              type="text"
              minLength={8}
              placeholder={t("At least 8 characters")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!ready}
              onClick={() => setReviewed(true)}
            >
              {t("Review this change")}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* The values the earlier step collected go with the form. */}
          {choice === "role" ? <input type="hidden" name="role" value={newRole} /> : null}
          {choice === "password" ? (
            <input type="hidden" name="password" value={password} />
          ) : null}

          <p className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
            <span>{consequence}</span>
          </p>
          <label className="block space-y-1 text-xs font-medium">
            <span>{t("Why? This is recorded in the audit trail.")}</span>
            <textarea
              name="reason"
              required
              minLength={DEVELOPER_REASON_MIN}
              rows={2}
              className="focus-ring w-full rounded-md border bg-background p-2 text-sm"
              placeholder={t("e.g. Hawa moved to the counter after the Dar restructure")}
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setReviewed(false)}>
              {t("Back")}
            </Button>
            <SubmitButton size="sm" pendingLabel={t("Recording…")}>
              {choice === "workas" ? t("Start working as them") : t("Confirm and record")}
            </SubmitButton>
          </div>
        </>
      )}
      <FormError state={state} />
      {state?.ok ? (
        <p className="text-xs text-success">{t("Done — recorded in the audit trail.")}</p>
      ) : null}
    </form>
  );
}
