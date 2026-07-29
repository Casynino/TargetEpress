"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { resolveException } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/actions/types";

export function ResolveExceptionForm({ exceptionId }: { exceptionId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    resolveException,
    { ok: true }
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="resolutionNote"
          placeholder="How was it resolved? e.g. missing carton found in BATCH-2026-002"
          required
        />
        <SubmitButton size="default" variant="brand" pendingLabel="Closing…">
          Resolve
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}
