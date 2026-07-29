import type { Metadata } from "next";

import { NewBatchForm } from "@/components/app/new-batch-form";
import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Open batch" };

export default async function NewBatchPage() {
  await requirePermission("batch.create");

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Open a new batch"
        description="A batch groups the cargo that will fly together. Its number is generated automatically."
      />
      <NewBatchForm />
    </div>
  );
}
