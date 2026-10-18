"use client";

import { useActionState, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  LogIn,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";
import { useFormStatus } from "react-dom";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** Role and password change what somebody can do, so they keep a reason. */
type Choice = "role" | "password";
/** Suspend and delete are one popup and one Confirm. */
type Popup = "active" | "delete";

function WorkAsPress() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogIn className="mr-1.5 h-3.5 w-3.5" />
      )}
      {t("Work as")}
    </Button>
  );
}

/**
 * One person's row on the Access page.
 *
 * Work as, Suspend and Delete are each ONE press and, for the last two, one
 * Confirm in a small popup — nothing to type, no reason to write. Every one is
 * on the audit trail under the Developer's name whether or not a reason is
 * given, and Delete removes the account, never the records.
 *
 * Changing a role or a password still asks for a short reason in a form, because
 * those change what somebody can DO.
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
  const [popup, setPopup] = useState<Popup | null>(null);
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
  const [workAsState, workAsAction] = useActionState<
    ActionResult | undefined,
    FormData
  >(startWorkingAs, undefined);

  /* A finished suspend or delete closes its popup; the list behind it refreshes. */
  useEffect(() => {
    if (activeState?.ok || deleteState?.ok) setPopup(null);
  }, [activeState, deleteState]);

  const close = () => {
    setChoice(null);
    setPassword("");
  };

  const roleLabel = (key: string) =>
    roles.find((r) => r.value === key)?.label ?? key;

  const action = choice === "role" ? roleAction : passwordAction;
  const state = choice === "role" ? roleState : passwordState;
  const consequence =
    choice === "role"
      ? t(
          "Move {name} from {from} to {to}. What they can do changes the next time they load a page.",
        )
          .replace("{name}", person.name)
          .replace("{from}", person.roleLabel)
          .replace("{to}", roleLabel(newRole))
      : t(
          "Set a new password for {name}. Their old one stops working immediately.",
        ).replace("{name}", person.name);
  const ready =
    choice === "role"
      ? newRole !== person.roleKey
      : choice === "password"
        ? password.length >= 8
        : true;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1.5">
        {person.active ? (
          <form action={workAsAction} className="mr-1">
            <input type="hidden" name="userId" value={person.id} />
            <WorkAsPress />
          </form>
        ) : null}
        {!isOwner ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setChoice("role")}
            >
              <UserCog className="mr-1.5 h-3.5 w-3.5" />
              {t("Change role")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setChoice("password")}
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              {t("Reset password")}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setPopup("active")}
        >
          {person.active ? (
            <UserX className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          )}
          {person.active ? t("Suspend") : t("Reactivate")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setPopup("delete")}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
      <FormError state={workAsState} />

      {/* Suspend / Reactivate / Delete: one popup, one Confirm. */}
      <Dialog open={popup !== null} onOpenChange={(o) => !o && setPopup(null)}>
        <DialogContent className="max-w-sm">
          {popup === "delete" ? (
            <form action={deleteAction} className="space-y-4">
              <input type="hidden" name="userId" value={person.id} />
              <DialogHeader>
                <DialogTitle>Delete {person.name}&apos;s account?</DialogTitle>
                <DialogDescription>
                  They can no longer sign in and the account leaves every list.
                  Everything they recorded stays, still under their name.
                </DialogDescription>
              </DialogHeader>
              <FormError state={deleteState} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPopup(null)}
                >
                  Cancel
                </Button>
                <SubmitButton
                  variant="destructive"
                  className="flex-1"
                  pendingLabel="Deleting…"
                >
                  Confirm
                </SubmitButton>
              </div>
            </form>
          ) : popup === "active" ? (
            <form action={activeAction} className="space-y-4">
              <input type="hidden" name="userId" value={person.id} />
              <input
                type="hidden"
                name="active"
                value={person.active ? "false" : "true"}
              />
              <DialogHeader>
                <DialogTitle>
                  {person.active ? "Suspend" : "Reactivate"} {person.name}?
                </DialogTitle>
                <DialogDescription>
                  {person.active
                    ? "They are signed out straight away and cannot sign in until you reactivate them."
                    : "They can sign in again straight away."}
                </DialogDescription>
              </DialogHeader>
              <FormError state={activeState} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPopup(null)}
                >
                  Cancel
                </Button>
                <SubmitButton className="flex-1" pendingLabel="Working…">
                  Confirm
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {choice ? (
        <form
          action={action}
          className="space-y-2.5 rounded-lg border bg-muted/40 p-3 text-left"
        >
          <input type="hidden" name="userId" value={person.id} />
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
