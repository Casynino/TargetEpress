import type { Metadata } from "next";

import { CompanySettingsForm } from "@/components/app/company-settings-form";
import { PageHeader } from "@/components/app/page-header";
import { companySettings } from "@/lib/company-settings";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Company settings" };

/**
 * What every customer is told, in one place.
 *
 * The collection accounts, the offices and the phone numbers used to live only
 * in code, so changing a Lipa number meant a deploy. They are editable here
 * now — and still fall back to the code values, so an empty settings table
 * renders exactly what the app has always rendered. A missing row must never
 * blank the accounts on an invoice.
 *
 * The owner's alone. Everyone else reads these; one mistyped number sends every
 * customer's money nowhere until somebody notices.
 */
export default async function CompanySettingsPage() {
  await requirePermission("settings.manage");
  const settings = await companySettings();

  return (
    <>
      <PageHeader
        title="Company settings"
        description="The accounts customers pay into, the offices they collect from, and how they reach you. Changed here, changed everywhere at once."
      />

      <p className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">
        These appear on invoices, PDFs, WhatsApp messages and the public site
        simultaneously. Invoices already raised are untouched — each one keeps
        the accounts it was issued with, so an old bill still shows the numbers
        the customer was actually given.
      </p>

      <CompanySettingsForm initial={settings} />
    </>
  );
}
