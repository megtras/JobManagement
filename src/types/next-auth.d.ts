import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      branchId: string | null;
      /** For TECHNICIAN accounts, the team(s) this shared device belongs to. */
      teamName: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    branchId: string | null;
    teamName?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    branchId: string | null;
    teamName: string | null;
  }
}
