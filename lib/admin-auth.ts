import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

export function isAuthorizedAdminRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && tokensMatch(token, requireEnv("ADMIN_TOKEN"));
}

// Constant-time comparison so a mismatched admin token can't be brute-forced
// via response-time differences. `timingSafeEqual` throws on unequal-length
// buffers, so the length check must happen first (and can be a plain,
// non-constant-time compare — token length isn't a secret).
function tokensMatch(token: string | undefined, expected: string): boolean {
  if (token === undefined) return false;
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (tokenBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(tokenBuffer, expectedBuffer);
}
