import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/voters/[voterId]/variations/route";
import { db } from "@/db/client";
import { createVoter } from "@/db/queries";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
});

function addVariationRequest(body: unknown) {
  return new Request("http://localhost/api/admin/voters/x/variations", {
    method: "POST",
    headers: { authorization: "Bearer secret123", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/voters/:voterId/variations", () => {
  it("rejects an unauthorized request", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(
      new Request(`http://localhost/api/admin/voters/${voter.id}/variations`, { method: "POST" }),
      { params: Promise.resolve({ voterId: voter.id }) }
    );
    expect(response.status).toBe(401);
  });

  it("rejects an invalid kind", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(addVariationRequest({ title: "A", kind: "video", src: "y" }), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(400);
  });

  it("404s when the voter doesn't exist", async () => {
    const response = await POST(addVariationRequest({ title: "A", kind: "image", src: "https://a.png" }), {
      params: Promise.resolve({ voterId: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("adds a variation to the given voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(
      addVariationRequest({ title: "Live default", kind: "image", src: "https://preview.example/a.png" }),
      { params: Promise.resolve({ voterId: voter.id }) }
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.variation.voterId).toBe(voter.id);
    expect(body.variation.position).toBe(0);
  });
});
