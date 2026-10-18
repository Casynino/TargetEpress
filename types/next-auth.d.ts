import type { Department, Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      department: Department;
    } & DefaultSession["user"];
    /** Which door the person signed in through, and when — see session.ts. */
    accountType: "staff" | "developer";
    signedInAt: number | null;
  }

  interface User {
    role: Role;
    department: Department;
    accountType?: "staff" | "developer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    department: Department;
    accountType?: "staff" | "developer";
    signedInAt?: number;
  }
}
