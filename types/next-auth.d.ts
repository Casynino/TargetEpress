import type { Department, Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      department: Department;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    department: Department;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    department: Department;
  }
}
