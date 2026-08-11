import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoterRequest, addVariationRequest, listVotersRequest } from "@/cli/api-client";

// Capture the real fetch before any test stubs it. The Neon HTTP driver used by
// tests/setup.ts's global `afterEach` (`db.delete(...)`) makes its own fetch calls to
// clean up the DB between tests — a blanket fetch mock would hijack those too and break
// DB cleanup, so the mock below only intercepts calls to the admin API and delegates
// everything else (like Neon's queries) to the real fetch.
const realFetch = global.fetch;

beforeEach(() => {
  vi.stubEnv("VARIATION_VOTER_URL", "https://example.vercel.app/");
  vi.stubEnv("VARIATION_VOTER_ADMIN_TOKEN", "secret123");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("https://example.vercel.app/api/admin/")) {
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      return realFetch(url, init);
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("cli/api-client", () => {
  it("sends an authenticated POST to create a voter, trimming a trailing slash from the base URL", async () => {
    await createVoterRequest({ title: "Nav refresh" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.vercel.app/api/admin/voters",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret123" }),
      })
    );
  });

  it("sends an authenticated POST to add a variation", async () => {
    await addVariationRequest("voter1", { title: "A", kind: "url", src: "https://a" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.vercel.app/api/admin/voters/voter1/variations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with the response body on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("https://example.vercel.app/api/admin/")) {
          return new Response("bad request", { status: 400 });
        }
        return realFetch(url, init);
      })
    );
    await expect(listVotersRequest()).rejects.toThrow(/400/);
  });
});
