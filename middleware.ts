import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { authConfig } from "@/auth.config";
import { maintenancePage } from "@/lib/maintenance-page";
import { permissionForPath, ROLE_PERMISSIONS } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

/**
 * The whole site, behind one switch.
 *
 * `MAINTENANCE_MODE=1` in Vercel closes every route — the public site, the
 * tracking page and the staff app alike — and hands back a black page instead.
 * Off, or absent, and this costs one string comparison and nothing else.
 *
 * `MAINTENANCE_BYPASS` is the way back in for whoever is doing the checking:
 * visit any URL with `?open=<that value>` once and a cookie carries you
 * through until you close the browser. It is a door for the owner, NOT a
 * permission — every /app route is still checked against a real session below,
 * and every server action still calls authorize() for itself. Somebody holding
 * this key sees a login page, the same as anyone else.
 *
 * 503 rather than 200, with Retry-After: this is a site that is coming back,
 * and Google must not index the black page as the business.
 */
const MAINTENANCE_COOKIE = "tx.preview";

function maintenanceGate(req: NextRequest): NextResponse | null {

  const key = "nino";
  const url = req.nextUrl;

  if (key) {
    /* Spend the key once, then strip it from the address bar — a maintenance
       link gets pasted into WhatsApp, and the query string travels with it. */
    if (url.searchParams.get("open") === key) {
      const clean = new URL(url);
      clean.searchParams.delete("open");
      const res = NextResponse.redirect(clean);
      res.cookies.set(MAINTENANCE_COOKIE, key, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      });
      return res;
    }
    if (req.cookies.get(MAINTENANCE_COOKIE)?.value === key) return null;
  }

  return new NextResponse(maintenancePage(), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "600",
    },
  });
}

/**
 * First line of defence. Every /app route needs a session, and routes listed
 * in ROUTE_PERMISSIONS additionally need the permission. Server actions and
 * page loaders re-check independently — middleware alone is never the gate.
 */
/**
 * A hint, not a credential.
 *
 * The public site is statically generated and its header is a client
 * component, so it has no way to know whether the person reading it is signed
 * in — which is why its staff link said "Login" to somebody who was already
 * signed in, and why stepping out to the main site felt like being logged out.
 *
 * So the middleware leaves a flag the header can read. It says that somebody is
 * signed in and nothing else: no identity, no role, no token. It grants
 * nothing — every /app request is still checked against the real session below
 * — and the worst a stale one can do is show a link that bounces to the login
 * page, which is what happens without it anyway.
 *
 * Readable by scripts on purpose. The session cookie stays httpOnly.
 */
const STAFF_HINT = "tx.staff";

function withHint(res: NextResponse, signedIn: boolean) {
  if (signedIn) {
    res.cookies.set(STAFF_HINT, "1", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12, // the session's own life — see auth.config.ts
    });
  } else {
    res.cookies.delete(STAFF_HINT);
  }
  return res;
}

const guarded = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isInternal = pathname.startsWith("/app");
  const isLogin = pathname === "/login";

  if (isLogin && session?.user) {
    return withHint(
      NextResponse.redirect(new URL("/app/dashboard", req.nextUrl)),
      true
    );
  }

  // Arriving at the login page without a session is the clearest signal there
  // is that the hint is stale. Signing out lands here.
  if (isLogin) return withHint(NextResponse.next(), false);

  if (!isInternal) return NextResponse.next();

  if (!session?.user) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return withHint(NextResponse.redirect(url), false);
  }

  const required = permissionForPath(pathname);
  if (required) {
    const role = session.user.role;
    const granted = role ? ROLE_PERMISSIONS[role] ?? [] : [];
    if (!granted.includes(required)) {
      return withHint(
        NextResponse.redirect(new URL("/app/no-access", req.nextUrl)),
        true
      );
    }
  }

  return withHint(NextResponse.next(), true);
});

/**
 * The gate runs first, over everything; the session work runs where it always
 * did. Widening the matcher to close the public site must not start decoding a
 * session on every marketing page, so the two responsibilities stay separate.
 */
type MiddlewareResult = Response | undefined;

export default function middleware(
  req: NextRequest,
  ev: NextFetchEvent
): MiddlewareResult | Promise<MiddlewareResult> {
  const closed = maintenanceGate(req);
  if (closed) return closed;

  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/app") && pathname !== "/login") {
    return NextResponse.next();
  }
  /* next-auth v5 types `auth()` as a route handler, whose second argument
     carries route params. As middleware it is handed a fetch event instead —
     which it does not read. The cast says only that. */
  return (guarded as unknown as (
    req: NextRequest,
    ev: NextFetchEvent
  ) => MiddlewareResult | Promise<MiddlewareResult>)(req, ev);
}

export const config = {
  /* Everything a person can land on. The build's own assets are excluded so a
     deploy still serves itself, and the black page needs none of them. */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
