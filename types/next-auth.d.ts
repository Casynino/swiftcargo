import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** `sid` is set for the developer account only: the id of its server-side
        DeveloperSession, which alone decides whether it may act. */
    user: { id: string; role: Role; sid?: string } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    sid?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    sid?: string;
  }
}
