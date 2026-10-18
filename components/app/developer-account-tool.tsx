"use client";

import { useActionState, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  changeUserRole,
  deleteUser,
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

type Choice = "role" | "active" | "password" | "delete";

function WorkAsPress() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Eye className="mr-1 h-3.5 w-3.5" />
      )}
      {t("Work as")}
    </Button>
  );
}

/**
 * One person's row on the Access page.
 *
 * WORK AS IS ONE PRESS. Every start is on the audit trail
 * under the Developer's name, so it asks nothing before it opens — a form in
 * front of a read-only look is friction with nothing behind it.
 *
 * Suspend, role and password DO change the account, so each is a short inline
 * form with the reason the server insists on. One step: the sentence above the
 * reason field says what will happen, so there is no separate review screen.
 */
export function DeveloperAccountTool({
  person,
  roles,
}: {
  person: Person;
  roles: { value: string; label: string }[];
}) {
  /* The owner's account can be looked as, suspended and deleted — but its role
     and password are the owner's own, so those two are not offered. */
  const isOwner = person.roleKey === "ADMIN";
  const t = useT();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [newRole, setNewRole] = useState(person.roleKey);
  const [password, setPassword] = useState("");

  const [roleState, roleAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(changeUserRole, undefined);
  const [activeState, activeAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(setUserActive, undefined);
  const [passwordState, passwordAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(resetUserPassword, undefined);
  const [deleteState, deleteAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(deleteUser, undefined);
  const [typed, setTyped] = useState("");
  const [workAsState, workAsAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(startWorkingAs, undefined);

  const close = () => {
    setChoice(null);
    setPassword("");
    setTyped("");
  };

  const roleLabel = (key: string) =>
    roles.find((r) => r.value === key)?.label ?? key;

  const action =
    choice === "role"
      ? roleAction
      : choice === "active"
        ? activeAction
        : choice === "delete"
          ? deleteAction
          : passwordAction;
  const state =
    choice === "role"
      ? roleState
      : choice === "active"
        ? activeState
        : choice === "delete"
          ? deleteState
          : passwordState;

  const consequence =
    choice === "role"
      ? t(
          "Move {name} from {from} to {to}. What they can do changes the next time they load a page.",
        )
          .replace("{name}", person.name)
          .replace("{from}", person.roleLabel)
          .replace("{to}", roleLabel(newRole))
      : choice === "active"
        ? person.active
          ? t(
              "Suspend {name}. They are signed out of everything on their next request and cannot sign in.",
            ).replace("{name}", person.name)
          : t("Reactivate {name}. They can sign in again immediately.").replace(
              "{name}",
              person.name,
            )
        : t(
            "Set a new password for {name}. Their old one stops working immediately.",
          ).replace("{name}", person.name);

  const ready =
    choice === "role"
      ? newRole !== person.roleKey
      : choice === "password"
        ? password.length >= 8
        : choice === "delete"
          ? typed.trim().toLowerCase() === person.name.trim().toLowerCase()
          : true;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {person.active ? (
          <form action={workAsAction}>
            <input type="hidden" name="userId" value={person.id} />
            <WorkAsPress />
          </form>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setChoice(choice === "active" ? null : "active")}
        >
          {person.active ? t("Suspend") : t("Reactivate")}
        </Button>
        <details className="group relative">
          <summary className="focus-ring inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
            {t("More")}
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-soft">
            {!isOwner ? (
              <>
                <button
                  type="button"
                  className="focus-ring block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={(e) => {
                    setChoice("role");
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {t("Change role")}
                </button>
                <button
                  type="button"
                  className="focus-ring block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={(e) => {
                    setChoice("password");
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {t("Reset password")}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="focus-ring block w-full rounded-md px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                setChoice("delete");
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Delete account
            </button>
          </div>
        </details>
      </div>
      <FormError state={workAsState} />

      {choice === "delete" ? (
        <form
          action={deleteAction}
          className="space-y-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-left"
        >
          <input type="hidden" name="userId" value={person.id} />
          <p className="text-sm font-medium">
            Delete {person.name}&apos;s account?
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            They can no longer sign in, and the account disappears from every
            list. Everything they recorded stays exactly as it is, still under
            their name — only the account goes, not the data.
          </p>
          <label className="block space-y-1 text-xs font-medium">
            <span>Type their name to confirm: {person.name}</span>
            <Input
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={person.name}
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={close}>
              {t("Cancel")}
            </Button>
            <SubmitButton
              size="sm"
              variant="destructive"
              pendingLabel="Deleting…"
              disabled={!ready}
            >
              Delete account
            </SubmitButton>
          </div>
          <FormError state={deleteState} />
        </form>
      ) : choice ? (
        <form
          action={action}
          className="space-y-2.5 rounded-lg border bg-muted/40 p-3 text-left"
        >
          <input type="hidden" name="userId" value={person.id} />
          {choice === "active" ? (
            <input
              type="hidden"
              name="active"
              value={person.active ? "false" : "true"}
            />
          ) : null}
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
          <p className="text-sm">{consequence}</p>
          <label className="block space-y-1 text-xs font-medium">
            <span>{t("Why? This is recorded in the audit trail.")}</span>
            <textarea
              name="reason"
              required
              minLength={DEVELOPER_REASON_MIN}
              rows={2}
              className="focus-ring w-full rounded-md border bg-background p-2 text-sm"
              placeholder={t(
                "e.g. Hawa moved to the counter after the Dar restructure",
              )}
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={close}>
              {t("Cancel")}
            </Button>
            <SubmitButton
              size="sm"
              pendingLabel={t("Recording…")}
              disabled={!ready}
            >
              {t("Confirm and record")}
            </SubmitButton>
          </div>
          <FormError state={state} />
          {state?.ok ? (
            <p className="text-xs text-success">
              {t("Done — recorded in the audit trail.")}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
