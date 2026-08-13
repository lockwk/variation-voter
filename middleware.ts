import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { newId } from "@/lib/ids";
import { VIEWER_COOKIE } from "@/lib/viewer";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Ensures every visitor carries an anonymous `vv_viewer` cookie identifying
// them across requests, so votes can be scoped to "one per viewer per
// variation" without requiring an account. Runs on (almost) every request —
// including API routes — so a direct POST to the votes endpoint (no prior
// page load) still gets an id.
export function middleware(request: NextRequest) {
  if (request.cookies.get(VIEWER_COOKIE)?.value) {
    return NextResponse.next();
  }

  const viewerId = newId();

  // Standard Next.js "set cookie, forward on request" pattern: append the
  // freshly generated cookie onto the *forwarded* request's Cookie header so
  // this same request's SSR (or route handler) can read it immediately via
  // next/headers cookies() / the Cookie header, not just on the next
  // round-trip. The Set-Cookie below is what persists it in the browser.
  const requestHeaders = new Headers(request.headers);
  const existingCookieHeader = requestHeaders.get("cookie");
  requestHeaders.set(
    "cookie",
    existingCookieHeader ? `${existingCookieHeader}; ${VIEWER_COOKIE}=${viewerId}` : `${VIEWER_COOKIE}=${viewerId}`
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(VIEWER_COOKIE, viewerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
