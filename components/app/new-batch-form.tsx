"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createBatch } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import { ORIGIN_LABELS, enumOptions } from "@/lib/constants";

export function NewBatchForm() {
  const router = useRouter();
  const [state, action] = useActionState<
    ActionResult<{ id: string; batchNumber: string }>,
    FormData
  >(createBatch, { ok: true });

  // Straight into the new batch so cargo can be loaded immediately.
  useEffect(() => {
    if (state.ok && state.data?.id) {
      router.push(`/app/batches/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-5 rounded-xl border bg-card p-6 shadow-soft">
      <div className="space-y-2">
        <Label htmlFor="origin">Origin</Label>
        <NativeSelect id="origin" name="origin" defaultValue="GUANGZHOU" required>
          {enumOptions(ORIGIN_LABELS).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">
          Notes <span className="font-normal text-muted-foreground">optional</span>
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Target flight, agent, anything the team should know."
        />
      </div>

      <FormError state={state} />

      <div className="flex gap-3">
        <SubmitButton variant="brand" pendingLabel="Opening…">
          Open batch
        </SubmitButton>
        <Link
          href="/app/batches"
          className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
