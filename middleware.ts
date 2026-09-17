import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * First line of defence, and deliberately the thinnest one.
 *
 * /app and /portal both need a session, and the two must not be reachable from
 * each other. That is all this decides.
 *
 * THE PERMISSION IS NOT DECIDED HERE. This runs on the edge, where the database
 * is unreachable, so the only role it could consult is the one frozen into the
 * token at sign-in. Every page behind /app calls `requirePermission` and every
 * server action calls `authorize`, and both read the live row — which is the
 * whole point of checking the database on each request, so that removing
 * somebody's access means now. Two layers disagreeing is worse than one layer
 * fewer: a promoted user sent to /app/no-access by a stale token cannot reach
 * the page their real role opens until the token expires.
 *
 * So this asks two questions — is somebody signed in, and are they staff — and
 * nothing else.
 */

/**
 * A hint, not a credential.
 *
 * The public site is statically generated and its header is a client component,
 * so it has no way to know whether the reader is signed in — which is why the
 * staff link says "Login" to somebody who is already signed in, and why stepping
 * out to the marketing site feels like being logged out.
 *
 * This cookie says that somebody is signed in and nothing else: no identity, no
 * role, no token. It grants nothing — every /app request is still checked below
 * and again on the page — and the worst a stale one can do is show a link that
 * bounces to the login page, which is what happens without it anyway.
 *
 * Readable by scripts on purpose. The session cookie stays httpOnly.
 */
const SESSION_HINT = "swc.session";

function withHint(res: NextResponse, signedIn: boolean, staff = false) {
  if (signedIn) {
    res.cookies.set(SESSION_HINT, staff ? "staff" : "customer", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12, // the session's own life — see auth.config.ts
    });
  } else {
    res.cookies.delete(SESSION_HINT);
  }
  return res;
}

/**
 * The area itself or something under it — never a sibling that merely shares
 * the letters. `/apple-icon.png` and `/app-store` are public files a phone or a
 * crawler asks for without a session, and a bare prefix test sent them to the
 * sign-in page.
 */
function inArea(pathname: string, area: "/app" | "/portal"): boolean {
  return pathname === area || pathname.startsWith(`${area}/`);
}

const guarded = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;
  const isCustomer = role === "CUSTOMER";

  const isStaffArea = inArea(pathname, "/app");
  const isPortal = inArea(pathname, "/portal");
  const isLogin = pathname === "/login";

  /* A cookie whose account has been suspended: the app has just sent them here
     on purpose, so bouncing them back would loop for ever. */
  const revoked = req.nextUrl.searchParams.get("revoked") === "1";

  if (isLogin && session?.user && !revoked) {
    const home = isCustomer ? "/portal" : "/app/dashboard";
    return withHint(
      NextResponse.redirect(new URL(home, req.nextUrl)),
      true,
      !isCustomer
    );
  }

  /* Arriving at the login page without a session is the clearest signal there is
     that the hint is stale. Signing out lands here. */
  if (isLogin) return withHint(NextResponse.next(), false);

  if (!isStaffArea && !isPortal) return NextResponse.next();

  if (!session?.user) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return withHint(NextResponse.redirect(url), false);
  }

  /*
    THE TWO SHELLS DO NOT OVERLAP.

    A customer in /app is not a permission failure to be explained on a
    no-access page — they have no business knowing the staff app exists. A
    member of staff in /portal is looking at a screen built to show one
    customer's data and would see nobody's. Each goes home.
  */
  if (isStaffArea && isCustomer) {
    return withHint(NextResponse.redirect(new URL("/portal", req.nextUrl)), true);
  }
  if (isPortal && !isCustomer) {
    return withHint(
      NextResponse.redirect(new URL("/app/dashboard", req.nextUrl)),
      true,
      true
    );
  }

  return withHint(NextResponse.next(), true, !isCustomer);
});

/**
 * Decoding a session on every marketing page is wasted work on a statically
 * generated site, so the guard only runs where a session means something.
 */
type MiddlewareResult = Response | undefined;

export default function middleware(
  req: NextRequest,
  ev: NextFetchEvent
): MiddlewareResult | Promise<MiddlewareResult> {
  const { pathname } = req.nextUrl;

  /* Uploaded files are not public. Anything still sitting in public/uploads
     would otherwise be served before any route could ask who is looking, so
     the path is handed to the route that does — see lib/file-access.ts. */
  if (pathname.startsWith("/uploads/")) {
    const url = req.nextUrl.clone();
    url.pathname = `/api/files/${pathname.slice("/uploads/".length)}`;
    return NextResponse.rewrite(url);
  }

  if (!inArea(pathname, "/app") && !inArea(pathname, "/portal") && pathname !== "/login") {
    return NextResponse.next();
  }

  /* next-auth v5 types `auth()` as a route handler, whose second argument
     carries route params. As middleware it is handed a fetch event instead —
     which it does not read. The cast says only that. */
  return (
    guarded as unknown as (
      req: NextRequest,
      ev: NextFetchEvent
    ) => MiddlewareResult | Promise<MiddlewareResult>
  )(req, ev);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
