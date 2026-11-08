"use client";

import { useActionState, useState } from "react";
import { Eye, Loader2, Search } from "lucide-react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/app/form-feedback";
import { ActionTile } from "@/components/developer/action-tile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent active:bg-accent disabled:opacity-60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
        {initials(person.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">
          {person.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {person.roleLabel}
        </span>
      </span>
      {mine ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Eye className="size-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * WORK AS: PICK A NAME, YOU ARE IN.
 *
 * A button that opens a short list of everyone who can be looked as — name and
 * role, nothing else — and one press on a name opens the app as them. It posts
 * to the same action as the buttons on Access, so it is the same
 * session, on the same audit trail, ended by the same Stop.
 */
export function DeveloperWorkAs({
  people,
  tile = false,
}: {
  people: WorkAsPerson[];
  /** On the Home page it is a tile among the others; elsewhere a button. */
  tile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    startWorkingAs,
    undefined,
  );

  const openIt = () => {
    setQ("");
    setOpen(true);
  };

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? people.filter((p) =>
        `${p.name} ${p.roleLabel}`.toLowerCase().includes(needle),
      )
    : people;

  return (
    <>
      {tile ? (
        <ActionTile
          icon={Eye}
          title="Work as"
          text="Use the app as any person, as you."
          onClick={openIt}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={openIt}
        >
          <Eye className="mr-1.5 size-4" />
          Work as
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* A small card in the middle of the screen, on a phone too (owner,
            8 Nov 2026) — not a full-height sheet: a short title, a slim
            search and compact rows, as on BlueWave. */}
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-sm gap-3 rounded-2xl p-4 sm:rounded-2xl"
          // Nobody is picked yet: the first name must not open already lit
          // (its focus ring was cut off by the scrolling list's edge).
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="space-y-0.5 pr-6 text-left">
            <DialogTitle className="text-base">Work as…</DialogTitle>
            <DialogDescription className="text-xs">
              Use the app as this person. Recorded under you.
            </DialogDescription>
          </DialogHeader>

          {people.length > 6 ? (
            <label className="flex h-9 items-center gap-2 rounded-full border bg-background px-3 focus-within:border-brand">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a name or role"
                aria-label="Search a name or role"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          ) : null}

          <form action={action}>
            <div className="-mx-1 max-h-[50vh] space-y-0.5 overflow-y-auto sm:max-h-[22rem]">
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
