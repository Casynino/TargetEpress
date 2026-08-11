"use client";

import { useActionState } from "react";
import { PackageCheck } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { receiveBatch } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";

export function ReceiveBatchButton({ batchId }: { batchId: string }) {
  const t = useT();
  const [state, action] = useActionState<ActionResult, FormData>(receiveBatch, {
    ok: true,
  });

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton variant="brand" size="sm" pendingLabel="Recording…">
        <PackageCheck className="mr-2 h-4 w-4" />
        {t("Mark as arrived")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
