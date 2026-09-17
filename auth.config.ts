import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth setup.
 *
 * Middleware runs on the edge runtime, where bcrypt and the Prisma client are
 * unavailable, so the provider list stays empty here and lives in `auth.ts`.
 * Everything the middleware needs — is there a session, and is it a customer's —
 * is carried in the JWT.
 */
export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // a warehouse shift
    /**
     * Roll the shift forward while somebody is working.
     *
     * maxAge alone counts from the moment of sign-in, and NextAuth only rewrites
     * a token once it is older than updateAge — which defaults to 24 hours, so
     * with a 12-hour session the refresh never happens and the clock is never
     * reset. A clerk who signed in at six would be signed out at six, whether or
     * not they were mid-invoice.
     *
     * Thirty minutes: use extends the window, so nobody is thrown out in the
     * middle of the work, and a phone left on a warehouse shelf still ends its
     * own session.
     */
    updateAge: 60 * 30,
  },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as typeof session.user.role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
