"use client";

import { useActionState, useState } from "react";
import { Eye, Loader2, Search } from "lucide-react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { startWorkingAs } from "@/lib/actions/developer";
import type { ActionResult } from "@/lib/actions/types";
import { initials } from "@/lib/developer/format";
import { cn } from "@/lib/utils";

export type WorkAsPerson = { id: string; name: string; roleLabel: string };

function PersonRow({ person }: { person: WorkAsPerson }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("userId") === person.id;
  return (
    <button
      type="submit"
      name="userId"
      value={person.id}
      disabled={pending}
      className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials(person.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {person.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {person.roleLabel}
        </span>
      </span>
      {mine ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Eye className="size-4 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * WORK AS: PICK A NAME, YOU ARE IN.
 *
 * A button that opens a short list of everyone who can be looked as — name and
 * role, nothing else — and one press on a name opens the app as them. It posts
 * to the same action as the buttons on Access, so it is the same view-only
 * session, on the same audit trail, ended by the same Stop.
 */
export function DeveloperWorkAs({
  people,
  onHero = false,
}: {
  people: WorkAsPerson[];
  /** On the violet Home banner: an outlined white button. */
  onHero?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    startWorkingAs,
    undefined,
  );

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? people.filter((p) =>
        `${p.name} ${p.roleLabel}`.toLowerCase().includes(needle),
      )
    : people;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "rounded-full",
          onHero &&
            "border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white",
        )}
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
      >
        <Eye className="mr-1.5 size-4" />
        Work as someone
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Work as someone</DialogTitle>
            <DialogDescription>
              Pick a person to see the app exactly as they see it. View only —
              nothing can be changed.
            </DialogDescription>
          </DialogHeader>

          {people.length > 6 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or role"
                className="pl-9"
                autoFocus
              />
            </div>
          ) : null}

          <form action={action}>
            <div className="max-h-[55vh] space-y-0.5 overflow-y-auto">
              {shown.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No one matches.
                </p>
              ) : (
                shown.map((p) => <PersonRow key={p.id} person={p} />)
              )}
            </div>
          </form>
          <FormError state={state} />
        </DialogContent>
      </Dialog>
    </>
  );
}
