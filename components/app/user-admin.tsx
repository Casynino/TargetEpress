"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { KeyRound, UserPlus } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  changeUserRole,
  createUser,
  resetUserPassword,
  setUserActive,
} from "@/lib/actions/users";
import Link from "next/link";

import type { ActionResult } from "@/lib/actions/types";
import { ROLE_LABELS, enumOptions } from "@/lib/constants";
import { formatRelative } from "@/lib/format";

type StaffUser = {
  id: string;
  name: string;
  employeeId: string | null;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
};

export function UserRow({
  user,
  isSelf,
}: {
  user: StaffUser;
  isSelf: boolean;
}) {
  const [showReset, setShowReset] = useState(false);
  const [activeState, activeAction] = useActionState<ActionResult, FormData>(
    setUserActive,
    { ok: true }
  );
  const [roleState, roleAction] = useActionState<ActionResult, FormData>(
    changeUserRole,
    { ok: true }
  );
  const [resetState, resetAction] = useActionState<ActionResult, FormData>(
    resetUserPassword,
    { ok: true }
  );

  return (
    <>
      <TableRow className={user.active ? "" : "opacity-60"}>
        <TableCell>
          {/* The name opens the full employee profile — sign-in history,
              audit trail and everything they have registered. */}
          <Link
            href={`/app/admin/users/${user.id}`}
            className="text-sm font-medium hover:text-brand"
          >
            {user.name}
            {isSelf ? (
              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
            ) : null}
          </Link>
          {user.employeeId ? (
            <p className="font-mono text-xs text-muted-foreground tabular">
              {user.employeeId}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{user.email}</p>
          {user.phone ? (
            <p className="text-xs text-muted-foreground">{user.phone}</p>
          ) : null}
        </TableCell>

        <TableCell className="hidden md:table-cell">
          {isSelf ? (
            <Badge variant="brand">{ROLE_LABELS[user.role]}</Badge>
          ) : (
            <form action={roleAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <NativeSelect
                name="role"
                defaultValue={user.role}
                className="h-9 w-44 text-xs"
              >
                {enumOptions(ROLE_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
              <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                Save
              </SubmitButton>
            </form>
          )}
        </TableCell>

        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
          {user.lastLoginAt ? formatRelative(user.lastLoginAt) : "Never"}
        </TableCell>

        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowReset((v) => !v)}
              title="Reset password"
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            {isSelf ? null : (
              <form action={activeAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input
                  type="hidden"
                  name="active"
                  value={user.active ? "false" : "true"}
                />
                <SubmitButton
                  size="sm"
                  variant={user.active ? "ghost" : "outline"}
                  pendingLabel="…"
                >
                  {user.active ? "Deactivate" : "Reactivate"}
                </SubmitButton>
              </form>
            )}
          </div>
        </TableCell>
      </TableRow>

      {showReset ? (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/40">
            <form action={resetAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`pw-${user.id}`} className="text-xs">
                  New password for {user.name}
                </Label>
                <Input
                  id={`pw-${user.id}`}
                  name="password"
                  type="text"
                  minLength={8}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <SubmitButton size="default" variant="brand" pendingLabel="Saving…">
                Set password
              </SubmitButton>
            </form>
            <div className="mt-2 space-y-2">
              <FormError state={resetState} />
              <FormError state={activeState} />
              <FormError state={roleState} />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function NewUserForm() {
  const [state, action] = useActionState<ActionResult, FormData>(createUser, {
    ok: true,
  });
  const [created, setCreated] = useState(false);

  return (
    <section className="h-fit rounded-xl border bg-card p-6 shadow-soft">
      <h2 className="flex items-center gap-2 font-display font-semibold">
        <UserPlus className="h-4 w-4 text-brand" />
        Add a staff member
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        They sign in with this email and password. Their dashboard is chosen by
        their role.
      </p>

      <form
        action={action}
        className="mt-5 space-y-3"
        onSubmit={() => setCreated(true)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">
            Full name
          </Label>
          <Input id="name" name="name" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">
            Work email
          </Label>
          <Input id="email" name="email" type="email" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs">
            Phone
          </Label>
          <Input id="phone" name="phone" inputMode="tel" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role" className="text-xs">
            Role
          </Label>
          <NativeSelect id="role" name="role" defaultValue="CHINA_WAREHOUSE">
            {enumOptions(ROLE_LABELS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="employeeId" className="text-xs">
              Employee ID
            </Label>
            <Input
              id="employeeId"
              name="employeeId"
              placeholder="TX-014"
              maxLength={24}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rank" className="text-xs">
              Warehouse rank
            </Label>
            <NativeSelect id="rank" name="rank" defaultValue="OPERATOR">
              <option value="OPERATOR">Warehouse Operator</option>
              <option value="MANAGER">Warehouse Manager</option>
            </NativeSelect>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The ID cannot be changed later. Rank applies to warehouse staff only.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-xs">
            Status
          </Label>
          <NativeSelect id="status" name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">
            Temporary password
          </Label>
          <Input
            id="password"
            name="password"
            type="text"
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
          <p className="text-xs text-muted-foreground">
            Give it to them in person and change it after their first sign-in.
          </p>
        </div>

        <FormError state={state} />
        <FormSuccess
          message={state.ok && created ? "Staff account created." : null}
        />

        <SubmitButton variant="brand" className="w-full" pendingLabel="Creating…">
          Create account
        </SubmitButton>
      </form>
    </section>
  );
}
