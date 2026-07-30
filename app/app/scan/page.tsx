import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ScanWorkbench } from "@/components/app/scan-workbench";
import { ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Scan QR" };

const ROLE_HINT: Record<string, string> = {
  CHINA_WAREHOUSE: "You will see what was registered for this cargo.",
  DAR_WAREHOUSE: "You will see whether this cargo may be released.",
  FINANCE: "You will see the invoice and what is still owed.",
  ADMIN: "You will see the full picture for this shipment.",
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await requireUser();
  const { code } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Scan a label"
        description={`${ROLE_LABELS[user.role]} — ${ROLE_HINT[user.role] ?? ""}`}
      />
      {/* A code in the URL is resolved immediately. That makes a QR testable
          without a second device, and lets a scanner app that opens URLs hand
          off straight into this screen. */}
      <ScanWorkbench initialCode={code} />
    </div>
  );
}
