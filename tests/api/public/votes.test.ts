import { describe, expect, it } from "vitest";
import { POST, PATCH } from "@/app/api/voters/[voterId]/variations/[variationId]/votes/route";
import { db } from "@/db/client";
import { createVoter, addVariation, closeVoter } from "@/db/queries";

// Simulates a single browser's persisted vv_viewer cookie riding along on
// every request it makes, the same way middleware.ts + the browser's cookie
// jar do outside of tests.
function voteRequest(method: string, body: unknown, viewerId?: string) {
  return new Request("http://localhost/votes", {
    method,
    headers: {
      "content-type": "application/json",
      ...(viewerId ? { cookie: `vv_viewer=${viewerId}` } : {}),
    },
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

    const response = await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.state).toBe("added");
    expect(body.vote.direction).toBe("up");
    expect(body.vote.comment).toBeNull();
  });

  it("toggles: voting the same direction again undoes the vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const response = await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("removed");
    expect(body.vote).toBeNull();
  });

  it("switches: voting the opposite direction flips the existing vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const response = await POST(voteRequest("POST", { direction: "down" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("switched");
    expect(body.vote.direction).toBe("down");
  });

  it("lets two different viewers each cast their own vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const first = await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const second = await POST(voteRequest("POST", { direction: "up" }, "viewer-2"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });

    expect((await first.json()).state).toBe("added");
    expect((await second.json()).state).toBe("added");
  });
});

describe("PATCH /api/voters/:voterId/variations/:variationId/votes", () => {
  it("attaches a comment to the viewer's current vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const postResponse = await POST(voteRequest("POST", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { vote } = await postResponse.json();

    const patchResponse = await PATCH(
      voteRequest("PATCH", { comment: "nice", voterName: "Kevin" }, "viewer-1"),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(patchResponse.status).toBe(200);
    const body = await patchResponse.json();
    expect(body.vote.id).toBe(vote.id);
    expect(body.vote.comment).toBe("nice");
  });

  it("409s when the viewer has no current vote to comment on", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(409);
  });

  it("rejects a body with neither comment nor voterName", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", {}, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });
});
