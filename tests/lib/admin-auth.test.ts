import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";

describe("isAuthorizedAdminRequest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a matching Bearer token", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters", {
      headers: { authorization: "Bearer secret123" },
    });
    expect(isAuthorizedAdminRequest(request)).toBe(true);
  });

  it("rejects a mismatched token", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(isAuthorizedAdminRequest(request)).toBe(false);
  });

  it("rejects a missing header", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters");
    expect(isAuthorizedAdminRequest(request)).toBe(false);
  });
});
