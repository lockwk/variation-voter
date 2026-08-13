import { cookies } from "next/headers";

/** Name of the anonymous per-browser identity cookie set by middleware.ts. */
export const VIEWER_COOKIE = "vv_viewer";

/**
 * Reads the viewer id cookie in Server Components (and anywhere else that has
 * access to Next's request-scoped `cookies()`). Returns null when unset, and
 * also when called outside of an active request scope (e.g. some test
 * harnesses that invoke a page/component function directly) rather than
 * throwing — viewer-awareness degrades gracefully to "unknown viewer" there.
 */
export async function getViewerId(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(VIEWER_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads the viewer id directly from a Request's `Cookie` header. Route
 * Handlers receive the raw Request, and parsing the header here avoids a
 * dependency on Next's request-scope AsyncLocalStorage (which next/headers'
 * `cookies()` requires and which isn't present when a handler is invoked
 * directly, e.g. in unit tests) — this works identically in production and
 * in tests that set a `cookie` header on a plain Request.
 */
export function getViewerIdFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === VIEWER_COOKIE) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}
