import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  PasswordForm,
  PersonalDetailsForm,
} from "@/components/app/profile-settings";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Personal details" };

const RANK_LABELS: Record<string, string> = {
  OPERATOR: "Warehouse Operator",
  MANAGER: "Warehouse Manager",
};

export default async function ProfileSettingsPage() {
  const session = await requireUser();

  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      phone: true,
      emergencyContact: true,
      preferredLanguage: true,
      photoUrl: true,
      employeeId: true,
      role: true,
      department: true,
      rank: true,
      joinedAt: true,
    },
  });
  if (!me) redirect("/login");

  return (
    <>
      <PageHeader
        title="Personal details"
        description="Yours to change. Anything about your employment is set by management."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/profile">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="panel">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              About you
            </h2>
            <PersonalDetailsForm
              profile={{
                name: me.name,
                phone: me.phone,
                emergencyContact: me.emergencyContact,
                preferredLanguage: me.preferredLanguage,
                photoUrl: me.photoUrl,
              }}
            />
          </section>

          <section className="panel">
            <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
              <Lock className="h-4 w-4" />
              Password
            </h2>
            <PasswordForm />
          </section>
        </div>

        {/* Plain text, not disabled inputs. A greyed-out field invites people
            to try; a line of text tells them who to ask. */}
        <section className="panel h-fit">
          <div className="border-b px-5 py-4">
            <h2 className="font-display font-semibold">Set by management</h2>
            <p className="text-xs text-muted-foreground">
              Ask the office if any of this is wrong.
            </p>
          </div>
          <dl className="divide-y">
            {[
              { label: "Employee ID", value: me.employeeId ?? "Not assigned" },
              { label: "Company email", value: me.email },
              {
                label: "Department",
                value: DEPARTMENT_LABELS[me.department],
              },
              {
                label: "Role",
                value: me.rank ? RANK_LABELS[me.rank] : ROLE_LABELS[me.role],
              },
              { label: "Date joined", value: formatDate(me.joinedAt) },
            ].map((item) => (
              <div key={item.label} className="px-5 py-3">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
