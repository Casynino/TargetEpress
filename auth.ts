import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        // Every attempt is recorded, including the ones that fail against an
        // address nobody owns. Five failures overnight is the thing worth
        // seeing, and it is invisible if only successes are stored.
        const head = await headers();
        const record = (ok: boolean) =>
          prisma.loginEvent.create({
            data: {
              userId: user?.id ?? null,
              email,
              ok,
              ipAddress:
                head.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                head.get("x-real-ip"),
              userAgent: head.get("user-agent"),
            },
          });

        // Suspended and former staff keep their history but lose access.
        if (!user || !user.active || user.status !== "ACTIVE") {
          await record(false);
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          await record(false);
          return null;
        }

        await record(true);

        const now = new Date();
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now, lastActiveAt: now },
        });

        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            action: "auth.login",
            entity: "User",
            entityId: user.id,
            summary: `${user.name} signed in`,
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
        };
      },
    }),
  ],
});
