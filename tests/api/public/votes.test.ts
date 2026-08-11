import { describe, expect, it } from "vitest";
import { POST, PATCH } from "@/app/api/voters/[voterId]/variations/[variationId]/votes/route";
import { db } from "@/db/client";
import { createVoter, addVariation, closeVoter } from "@/db/queries";

function voteRequest(method: string, body: unknown) {
  return new Request("http://localhost/votes", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voters/:voterId/variations/:variationId/votes", () => {
  it("404s when the variation doesn't belong to the voter", async () => {
    const voterA = await createVoter(db, { title: "A" });
    const voterB = await createVoter(db, { title: "B" });
    const variation = await addVariation(db, voterA.id, { title: "x", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voterB.id, variationId: variation.id }),
    });
    expect(response.status).toBe(404);
  });

  it("403s when the voter is archived", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await closeVoter(db, voter.id);

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(403);
  });

  it("rejects an invalid body", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "sideways" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });

  it("records an anonymous vote with no comment yet", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.vote.direction).toBe("up");
    expect(body.vote.comment).toBeNull();
  });
});

describe("PATCH /api/voters/:voterId/variations/:variationId/votes", () => {
  it("attaches a comment to the vote created by an earlier POST", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const postResponse = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { vote } = await postResponse.json();

    const patchResponse = await PATCH(
      voteRequest("PATCH", { voteId: vote.id, comment: "nice", voterName: "Kevin" }),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(patchResponse.status).toBe(200);
    const body = await patchResponse.json();
    expect(body.vote.id).toBe(vote.id);
    expect(body.vote.comment).toBe("nice");
  });

  it("404s for an unknown voteId", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", { voteId: "nope", comment: "x" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a body missing voteId", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", { comment: "x" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });
});
