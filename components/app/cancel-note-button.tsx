"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelPickupNote } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

export function CancelNoteButton({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(
    cancelPickupNote,
    { ok: true }
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        Cancel note
      </Button>
    );
  }

  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="noteId" value={noteId} />
      <Input name="reason" placeholder="Why is it being cancelled?" required />
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="destructive" pendingLabel="Cancelling…">
          Confirm
        </SubmitButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Keep
        </Button>
      </div>
    </form>
  );
}
