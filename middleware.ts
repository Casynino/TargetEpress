import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { permissionForPath, ROLE_PERMISSIONS } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

/**
 * First line of defence. Every /app route needs a session, and routes listed
 * in ROUTE_PERMISSIONS additionally need the permission. Server actions and
 * page loaders re-check independently — middleware alone is never the gate.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isInternal = pathname.startsWith("/app");
  const isLogin = pathname === "/login";

  if (isLogin && session?.user) {
    return NextResponse.redirect(new URL("/app/dashboard", req.nextUrl));
  }

  if (!isInternal) return NextResponse.next();

  if (!session?.user) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const required = permissionForPath(pathname);
  if (required) {
    const role = session.user.role;
    const granted = role ? ROLE_PERMISSIONS[role] ?? [] : [];
    if (!granted.includes(required)) {
      return NextResponse.redirect(new URL("/app/no-access", req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/login"],
};
