import { describe, expect, it } from "vitest";
import { POST as postVote } from "@/app/api/voters/[voterId]/variations/[variationId]/votes/route";
import { POST as postComment } from "@/app/api/voters/[voterId]/variations/[variationId]/comments/route";
import {
  PATCH as patchComment,
  DELETE as deleteCommentRoute,
} from "@/app/api/voters/[voterId]/variations/[variationId]/comments/[commentId]/route";
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

// PATCH/DELETE take no body validation beyond commentStatusSchema for PATCH,
// so this mirrors commentRequest but allows an arbitrary method and an
// omitted body (DELETE sends none).
function commentActionRequest(method: "PATCH" | "DELETE", body: unknown, viewerId?: string) {
  return new Request("http://localhost/comments/x", {
    method,
    headers: {
      "content-type": "application/json",
      ...(viewerId ? { cookie: `vv_viewer=${viewerId}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

    expect(response.status).toBe(201);
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

  it("accepts an element-anchored pin with a selector", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(
      commentRequest(
        "comments",
        { comment: "fix this button", anchorType: "element", selector: "#hero button.cta" },
        "viewer-1"
      ),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.comment.anchorType).toBe("element");
    expect(body.comment.selector).toBe("#hero button.cta");
    expect(body.comment.status).toBe("open");
  });

  it("rejects an element anchor without a selector", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(
      commentRequest("comments", { comment: "x", anchorType: "element" }, "viewer-1"),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );
    expect(response.status).toBe(400);
  });

  it("accepts a point-anchored pin with fractional coordinates", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(
      commentRequest(
        "comments",
        { comment: "here", anchorType: "point", offsetX: 0.25, offsetY: 0.75 },
        "viewer-1"
      ),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.comment.anchorType).toBe("point");
    expect(body.comment.offsetX).toBe(0.25);
    expect(body.comment.offsetY).toBe(0.75);
  });

  it("rejects out-of-range coordinates", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await postComment(
      commentRequest("comments", { comment: "x", offsetX: 1.5, offsetY: 0.5 }, "viewer-1"),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/voters/:voterId/variations/:variationId/comments/:commentId", () => {
  it("lets the author mark a pin complete and reopen it", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();

    const params = Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id });

    const completed = await patchComment(commentActionRequest("PATCH", { status: "complete" }, "viewer-1"), {
      params,
    });
    expect(completed.status).toBe(200);
    expect((await completed.json()).comment.status).toBe("complete");

    const reopened = await patchComment(commentActionRequest("PATCH", { status: "open" }, "viewer-1"), {
      params,
    });
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).comment.status).toBe("open");
  });

  it("403s when a non-author tries to update status", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();

    const response = await patchComment(commentActionRequest("PATCH", { status: "complete" }, "viewer-2"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id }),
    });
    expect(response.status).toBe(403);
  });

  it("rejects an invalid status value", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();

    const response = await patchComment(commentActionRequest("PATCH", { status: "sideways" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id }),
    });
    expect(response.status).toBe(400);
  });

  it("403s when the voter is archived", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();
    await closeVoter(db, voter.id);

    const response = await patchComment(commentActionRequest("PATCH", { status: "complete" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id }),
    });
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/voters/:voterId/variations/:variationId/comments/:commentId", () => {
  it("lets the author delete their own pin", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();

    const response = await deleteCommentRoute(commentActionRequest("DELETE", undefined, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id }),
    });
    expect(response.status).toBe(200);

    const detail = await getVoterDetail(db, voter.id, "viewer-1");
    expect(detail!.variations[0].comments.find((c) => c.id === comment.id)).toBeUndefined();
  });

  it("403s when a non-author tries to delete", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const created = await postComment(commentRequest("comments", { comment: "x" }, "viewer-1"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { comment } = await created.json();

    const response = await deleteCommentRoute(commentActionRequest("DELETE", undefined, "viewer-2"), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id, commentId: comment.id }),
    });
    expect(response.status).toBe(403);

    const detail = await getVoterDetail(db, voter.id, "viewer-1");
    expect(detail!.variations[0].comments.find((c) => c.id === comment.id)).toBeDefined();
  });
});
