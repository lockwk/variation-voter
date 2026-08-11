import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/admin/voters/route";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
  vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
});

function adminRequest(body?: unknown) {
  return new Request("http://localhost/api/admin/voters", {
    method: "POST",
    headers: { authorization: "Bearer secret123", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/admin/voters", () => {
  it("rejects an unauthorized request", async () => {
    const response = await POST(new Request("http://localhost/api/admin/voters", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const response = await POST(adminRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("creates a voter and returns a share URL", async () => {
    const response = await POST(adminRequest({ title: "Nav refresh" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.voter.title).toBe("Nav refresh");
    expect(body.shareUrl).toBe(`http://localhost:3000/v/${body.voter.id}`);
  });
});

describe("GET /api/admin/voters", () => {
  it("rejects an unauthorized request", async () => {
    const response = await GET(new Request("http://localhost/api/admin/voters"));
    expect(response.status).toBe(401);
  });

  it("lists created voters", async () => {
    await POST(adminRequest({ title: "A" }));
    const response = await GET(
      new Request("http://localhost/api/admin/voters", {
        headers: { authorization: "Bearer secret123" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voters).toHaveLength(1);
  });
});
