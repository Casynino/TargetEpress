import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { verifyCredentials } from "@/lib/developer";

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

        const head = await headers();
        return verifyCredentials({
          email: parsed.data.email,
          password: parsed.data.password,
          ip:
            head.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            head.get("x-real-ip"),
          userAgent: head.get("user-agent"),
        });
      },
    }),
  ],
});
