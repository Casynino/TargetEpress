import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { asAccountType, verifyCredentials } from "@/lib/developer";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /* Which door the person used. Absent means Staff — every form and every
     session that existed before there were two doors. */
  accountType: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        accountType: { label: "Account type", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const head = await headers();
        return verifyCredentials({
          email: parsed.data.email,
          password: parsed.data.password,
          accountType: asAccountType(parsed.data.accountType),
          ip:
            head.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            head.get("x-real-ip"),
          userAgent: head.get("user-agent"),
        });
      },
    }),
  ],
});
