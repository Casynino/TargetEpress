import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { navForRole } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
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

  const [me, unread] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { displayName: true, photoUrl: true },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  // The heartbeat behind "online now". There is no socket; every authenticated
  // page load is the signal, which is exactly as accurate as it needs to be for
  // "is anyone on the floor right now".
  void prisma.user
    .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
    .catch(() => {
      // A failed heartbeat must never take a page down with it.
    });

  return (
    <AppShell
      sections={sections}
      user={{
        name: me?.displayName ?? user.name,
        email: user.email,
        role: user.role,
        photoUrl: me?.photoUrl ?? null,
      }}
      unreadNotifications={unread}
    >
      {children}
    </AppShell>
  );
}
