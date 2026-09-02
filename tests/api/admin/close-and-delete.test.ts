import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as closeVoterRoute } from "@/app/api/admin/voters/[voterId]/close/route";
import { DELETE as deleteVoterRoute } from "@/app/api/admin/voters/[voterId]/route";
import { db } from "@/db/client";
import { createVoter, getVoterDetail, addVariation, castVote } from "@/db/queries";
import { variations, votes } from "@/db/schema";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
});

function authed(url: string, method: string) {
  return new Request(url, { method, headers: { authorization: "Bearer secret123" } });
}

describe("POST /api/admin/voters/:voterId/close", () => {
  it("archives an existing voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await closeVoterRoute(authed(`http://localhost/x/${voter.id}/close`, "POST"), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voter.status).toBe("archived");
    expect(body.voter.archivedAt).toBeTruthy();
  });

  it("404s for a missing voter", async () => {
    const response = await closeVoterRoute(authed("http://localhost/x/nope/close", "POST"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/admin/voters/:voterId", () => {
  it("hard-deletes an existing voter and cascades to variations and votes", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "v", kind: "embed", src: "http://x" });
    const vote = await castVote(db, variation.id, { direction: "up" });

    const response = await deleteVoterRoute(authed(`http://localhost/x/${voter.id}`, "DELETE"), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    expect(await getVoterDetail(db, voter.id)).toBeNull();

    const remainingVariations = await db.select().from(variations).where(eq(variations.id, variation.id));
    expect(remainingVariations).toEqual([]);

    const remainingVotes = await db.select().from(votes).where(eq(votes.id, vote.id));
    expect(remainingVotes).toEqual([]);
  });

  it("404s for a missing voter", async () => {
    const response = await deleteVoterRoute(authed("http://localhost/x/nope", "DELETE"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });
});
