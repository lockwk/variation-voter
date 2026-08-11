import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoterRequest, addVariationRequest, listVotersRequest } from "@/cli/api-client";

beforeEach(() => {
  vi.stubEnv("VARIATION_VOTER_URL", "https://example.vercel.app/");
  vi.stubEnv("VARIATION_VOTER_ADMIN_TOKEN", "secret123");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }))
  );
});
afterEach(async () => {
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
      vi.fn(async () => new Response("bad request", { status: 400 }))
    );
    await expect(listVotersRequest()).rejects.toThrow(/400/);
  });
});
