import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { NewUserForm, UserRow } from "@/components/app/user-admin";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Staff") };
}

export default async function UsersPage() {
  const actor = await requirePermission("user.manage");
  const locale = await viewerLocale();

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      employeeId: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Create accounts, move people between departments, and switch access off the moment someone leaves."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Name")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Role")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Last login")}
                </TableHead>
                <TableHead className="text-right">
                  {t(locale, "Access")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={{
                    ...user,
                    lastLoginAt: user.lastLoginAt
                      ? user.lastLoginAt.toISOString()
                      : null,
                  }}
                  isSelf={user.id === actor.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <NewUserForm />
      </div>
    </>
  );
}
