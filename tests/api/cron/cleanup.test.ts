import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/cleanup/route";
import { db } from "@/db/client";
import { createVoter } from "@/db/queries";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
});

describe("GET /api/cron/cleanup", () => {
  it("rejects a request without the cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(response.status).toBe(401);
  });

  it("purges expired voters when authorized", async () => {
    const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
    const response = await GET(
      new Request("http://localhost/api/cron/cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deletedIds).toContain(voter.id);
  });
});
