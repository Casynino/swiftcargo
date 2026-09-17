import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

/*
  A STRANGER MUST NOT BE ABLE TO TELL A REAL ADDRESS FROM A MADE-UP ONE.

  The message is the same either way, but an unknown address used to return
  before bcrypt ran — a few milliseconds against a hundred — so the clock
  answered the question the words refused to. An unknown or suspended account
  is compared against this hash of a random string, which nothing matches.
*/
const NO_SUCH_ACCOUNT = "$2a$12$dSoAj6OJbTAa/l8IfNIPNuElmm0T3UDoAdidmPDBTb2.j9vmkZRiO";

/*
  GUESSING HAS A PRICE.

  Ten wrong passwords for one address inside fifteen minutes, or fifty from one
  connection, and that address or connection is refused — right password or not
  — until the window moves on. Counted from LoginEvent, which every attempt
  already writes, so it holds across every server instance and restarts. The
  owner can see the attempts on the audit screens; the attacker sees the same
  sentence as a wrong password.
*/
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 10;
const MAX_FAILURES_PER_IP = 50;

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

        /* Every attempt is recorded, including the ones against an address
           nobody owns. Five failures overnight is the thing worth seeing, and it
           is invisible if only successes are stored. */
        const head = await headers();
        const ipAddress =
          head.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          head.get("x-real-ip");
        const record = (ok: boolean) =>
          prisma.loginEvent.create({
            data: {
              userId: user?.id ?? null,
              email,
              ok,
              ipAddress,
              userAgent: head.get("user-agent")?.slice(0, 500),
            },
          });

        const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
        const [emailFailures, ipFailures] = await Promise.all([
          prisma.loginEvent.count({
            where: { email, ok: false, createdAt: { gte: since } },
          }),
          ipAddress
            ? prisma.loginEvent.count({
                where: { ipAddress, ok: false, createdAt: { gte: since } },
              })
            : Promise.resolve(0),
        ]);

        const usable = !!user && user.active && user.status === "ACTIVE";
        const ok = await bcrypt.compare(
          parsed.data.password,
          usable ? user.passwordHash : NO_SUCH_ACCOUNT
        );

        if (
          emailFailures >= MAX_FAILURES_PER_EMAIL ||
          ipFailures >= MAX_FAILURES_PER_IP
        ) {
          await record(false);
          return null;
        }

        // Suspended and former staff keep their history but lose access.
        if (!usable || !ok) {
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
        };
      },
    }),
  ],
});
