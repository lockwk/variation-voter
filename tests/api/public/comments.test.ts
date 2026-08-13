import { describe, expect, it } from "vitest";
import { POST as postVote } from "@/app/api/voters/[voterId]/variations/[variationId]/votes/route";
import { POST as postComment } from "@/app/api/voters/[voterId]/variations/[variationId]/comments/route";
import { db } from "@/db/client";
import { createVoter, addVariation, closeVoter, getVoterDetail } from "@/db/queries";

// Simulates a single browser's persisted vv_viewer cookie riding along on
// every request it makes, the same way middleware.ts + the browser's cookie
// jar do outside of tests.
function commentRequest(path: "votes" | "comments", body: unknown, viewerId?: string) {
  return new Request(`http://localhost/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(viewerId ? { cookie: `vv_viewer=${viewerId}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voters/:voterId/variations/:variationId/comments", () => {
  it("succeeds without a prior vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(
      commentRequest("comments", { comment: "nice", voterName: "Kevin" }, "viewer-1"),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comment.comment).toBe("nice");
    expect(body.comment.voterName).toBe("Kevin");
  });

  it("returns the commenter's own vote direction via getVoterDetail when they also voted", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    await postVote(commentRequest("votes", { direction: "up" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    await postComment(commentRequest("comments", { comment: "great" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });

    const detail = await getVoterDetail(db, voter.id, "viewer-1");
    const comment = detail!.variations[0].comments.find((c) => c.comment === "great");
    expect(comment?.direction).toBe("up");
    expect(comment?.isOwn).toBe(true);
  });

  it("rejects an invalid body", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(commentRequest("comments", {}, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a name-only body with 400, not 500", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(commentRequest("comments", { voterName: "Kevin" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });

  it("404s when the variation doesn't belong to the voter", async () => {
    const voterA = await createVoter(db, { title: "A" });
    const voterB = await createVoter(db, { title: "B" });
    const variation = await addVariation(db, voterA.id, { title: "x", kind: "url", src: "https://a" });

    const response = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voterB.id, variationId: variation.id }),
    });
    expect(response.status).toBe(404);
  });

  it("403s when the voter is archived", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await closeVoter(db, voter.id);

    const response = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(403);
  });
});
