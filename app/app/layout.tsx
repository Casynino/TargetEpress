import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { navForRole } from "@/lib/nav";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: {
    default: "Operations",
    template: "%s · Target Express Ops",
  },
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already gated this, but pages must never rely on it alone.
  const user = await requireUser();
  const sections = navForRole(user.role);

  return (
    <AppShell
      sections={sections}
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {children}
    </AppShell>
  );
}
