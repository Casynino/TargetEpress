"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RefreshCw, UserPlus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { createUser } from "@/lib/actions/users";
import type { ActionResult } from "@/lib/actions/types";

const WAREHOUSE = new Set(["CHINA_WAREHOUSE", "DAR_WAREHOUSE"]);

/** The order people think of them in: the floor first, the owner last. */
const ROLE_ORDER = ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "FINANCE", "CUSTOMER_CARE", "MANAGER", "ADMIN"];

/** No look-alikes (0/O, 1/l/I), so a password read out over the phone survives. */
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function makePassword() {
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("") + "7";
}

/**
 * ADD AN ACCOUNT: FOUR THINGS TO DO, IN ONE SMALL WINDOW.
 *
 * Name, email, a role picked from chips, and a password that is already made —
 * show it, copy it, or make another. Phone is optional; employee ID and
 * warehouse rank sit behind "More details" because most accounts need neither.
 * Opens over the page instead of pushing the list down and closes by itself
 * once the account exists. It posts to the same action the owner's form does,
 * so every rule there applies here unchanged.
 */
export function DeveloperAddPerson({
  roles,
  onHero = false,
}: {
  roles: { value: string; label: string }[];
  /** On the violet Home banner: a white button and white confirmation text. */
  onHero?: boolean;
}) {
  const ordered = ROLE_ORDER.map((v) => roles.find((r) => r.value === v)).filter(
    (r): r is { value: string; label: string } => Boolean(r)
  );
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [formKey, setFormKey] = useState(0);
  const [created, setCreated] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    createUser,
    undefined
  );
  const nameRef = useRef("");
  const wasPending = useRef(false);

  /* Close only on the result of THIS submit: `state` still holds the last one
     until the new one lands, so the transition out of pending is the signal. */
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (state?.ok) {
      setCreated(nameRef.current);
      setOpen(false);
      setRole("");
      setFormKey((k) => k + 1);
    }
  }, [pending, state]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {created ? (
        <p className={cn("text-sm", onHero ? "font-medium text-white" : "text-success")}>Created {created}.</p>
      ) : null}
      <Button
        type="button"
        className={cn("rounded-full", onHero && "bg-white text-violet-900 hover:bg-white/90")}
        onClick={() => {
          setCreated(null);
          setPassword(makePassword());
          setShowPassword(true);
          setOpen(true);
        }}
      >
        <UserPlus className="mr-1.5 size-4" />
        Add an account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add an account</DialogTitle>
            <DialogDescription className="sr-only">
              They sign in with this email and password. Their screens are chosen by their role.
            </DialogDescription>
          </DialogHeader>

          <form
            key={formKey}
            action={action}
            onSubmit={(e) => {
              nameRef.current = String(new FormData(e.currentTarget).get("name") ?? "");
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="add-name" className="text-xs">Full name</Label>
              <Input id="add-name" name="name" required autoFocus placeholder="e.g. Asha Juma" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email" className="text-xs">Email</Label>
              <Input id="add-email" name="email" type="email" required placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-phone" className="text-xs">Phone (optional)</Label>
              <Input id="add-phone" name="phone" inputMode="tel" placeholder="+255…" />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium">Role</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {ordered.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      role === r.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-accent"
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      required
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="sr-only"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="add-password" className="text-xs">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="add-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="off"
                  className="font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Make another password"
                  onClick={() => setPassword(makePassword())}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Made for you. They should change it after their first sign-in.
              </p>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                More details (employee ID, warehouse rank)
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="add-eid" className="text-xs">Employee ID</Label>
                  <Input id="add-eid" name="employeeId" placeholder="TX-014" maxLength={24} />
                  <p className="text-xs text-muted-foreground">Cannot be changed later.</p>
                </div>
                {WAREHOUSE.has(role) ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="add-rank" className="text-xs">Warehouse rank</Label>
                    <NativeSelect id="add-rank" name="rank" defaultValue="OPERATOR">
                      <option value="OPERATOR">Warehouse Operator</option>
                      <option value="MANAGER">Warehouse Manager</option>
                    </NativeSelect>
                  </div>
                ) : null}
              </div>
            </details>

            <FormError state={state} />

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton className="flex-1" pendingLabel="Creating…">
                Create account
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
