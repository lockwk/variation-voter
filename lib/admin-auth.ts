import { requireEnv } from "./env";

export function isAuthorizedAdminRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token === requireEnv("ADMIN_TOKEN");
}
