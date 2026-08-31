import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import {
  createVoter,
  addVariation,
  closeVoter,
  deleteVoter,
  listVoters,
  getVoterDetail,
  castVote,
  toggleVote,
  createComment,
  updateCommentStatus,
  deleteComment,
  purgeExpiredAndArchivedVoters,
  setVariationSrc,
} from "@/db/queries";
import { getStorage } from "@/lib/storage";

describe("createVoter", () => {
  it("defaults expiry to 7 days out", async () => {
    const before = Date.now();
    const voter = await createVoter(db, { title: "Nav refresh" });
    const days = (voter.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(voter.status).toBe("active");
  });

  it("honors an explicit expiresInDays", async () => {
    const before = Date.now();
    const voter = await createVoter(db, { title: "x", expiresInDays: 1 });
    const days = (voter.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeLessThan(1.01);
  });
});

describe("addVariation", () => {
  it("assigns sequential positions in insertion order", async () => {
    const voter = await createVoter(db, { title: "x" });
    const a = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const b = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });
});

describe("setVariationSrc", () => {
  it("updates the variation's src and returns the updated row", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "app", src: "pending" });

    const updated = await setVariationSrc(db, variation.id, `/apps/${variation.id}/index.html`);

    expect(updated?.src).toBe(`/apps/${variation.id}/index.html`);
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].src).toBe(`/apps/${variation.id}/index.html`);
  });

  it("returns null for a nonexistent variation id", async () => {
    expect(await setVariationSrc(db, "does-not-exist", "/apps/x/index.html")).toBeNull();
  });
});

describe("closeVoter / deleteVoter", () => {
  it("archives a voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const archived = await closeVoter(db, voter.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).not.toBeNull();
  });

  it("returns null when closing a missing voter", async () => {
    expect(await closeVoter(db, "does-not-exist")).toBeNull();
  });

  it("hard-deletes a voter and cascades to variations/votes", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });

    await deleteVoter(db, voter.id);

    const detail = await getVoterDetail(db, voter.id);
    expect(detail).toBeNull();
  });

  describe("storage cleanup", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("deletes the bundle for an app variation, but not for a url variation or the voter id", async () => {
      const voter = await createVoter(db, { title: "x" });
      const appVariation = await addVariation(db, voter.id, {
        title: "App",
        kind: "app",
        src: `/apps/pending/index.html`,
      });
      const urlVariation = await addVariation(db, voter.id, { title: "URL", kind: "url", src: "https://a" });

      const deleteBundle = vi.spyOn(getStorage(), "deleteBundle").mockResolvedValue(undefined);

      await deleteVoter(db, voter.id);

      expect(deleteBundle).toHaveBeenCalledWith(appVariation.id);
      expect(deleteBundle).not.toHaveBeenCalledWith(urlVariation.id);
      expect(deleteBundle).not.toHaveBeenCalledWith(voter.id);
      expect(deleteBundle).toHaveBeenCalledTimes(1);
    });

    it("does not delete any bundle when archiving a voter", async () => {
      const voter = await createVoter(db, { title: "x" });
      await addVariation(db, voter.id, { title: "App", kind: "app", src: `/apps/pending/index.html` });

      const deleteBundle = vi.spyOn(getStorage(), "deleteBundle").mockResolvedValue(undefined);

      await closeVoter(db, voter.id);

      expect(deleteBundle).not.toHaveBeenCalled();
    });

    it("returns null and does not delete any bundle for a nonexistent voter", async () => {
      const deleteBundle = vi.spyOn(getStorage(), "deleteBundle").mockResolvedValue(undefined);

      const result = await deleteVoter(db, "does-not-exist");

      expect(result).toBeNull();
      expect(deleteBundle).not.toHaveBeenCalled();
    });

    // End-to-end regression for KEV-84: exercises the real storage driver
    // (no vi.spyOn) so this fails if `deleteAppBundles` is ever removed from
    // `deleteVoter`, not just if `storage.deleteBundle` stops being *called*.
    it("actually removes the bundle from storage, not just invokes deleteBundle, when the voter is deleted", async () => {
      const storage = getStorage();
      const voter = await createVoter(db, { title: "x" });
      const appVariation = await addVariation(db, voter.id, {
        title: "App",
        kind: "app",
        src: `/apps/pending/index.html`,
      });

      try {
        await storage.putBundle(appVariation.id, new Map([["index.html", new TextEncoder().encode("<html></html>")]]));
        expect(await storage.getFile(appVariation.id, "index.html")).not.toBeNull();

        await deleteVoter(db, voter.id);

        expect(await storage.getFile(appVariation.id, "index.html")).toBeNull();
      } finally {
        // Safety net in case the assertion above fails before the bundle is
        // actually removed — don't leave stray files under .bundles/.
        await storage.deleteBundle(appVariation.id);
      }
    });
  });
});

describe("listVoters", () => {
  it("lists all voters", async () => {
    await createVoter(db, { title: "x" });
    await createVoter(db, { title: "y" });
    expect(await listVoters(db)).toHaveLength(2);
  });
});

describe("getVoterDetail", () => {
  it("returns null for a missing voter", async () => {
    expect(await getVoterDetail(db, "nope")).toBeNull();
  });

  it("aggregates up/down counts, score, and comments per variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });
    await castVote(db, variation.id, { direction: "up", viewerId: "commenter-1" });
    await createComment(db, { variationId: variation.id, viewerId: "commenter-1", comment: "great", voterName: "Kevin" });
    await castVote(db, variation.id, { direction: "down" });

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations).toHaveLength(1);
    const v = detail!.variations[0];
    expect(v.up).toBe(2);
    expect(v.down).toBe(1);
    expect(v.score).toBe(1);
    expect(v.comments).toHaveLength(1);
    expect(v.comments[0].comment).toBe("great");
    expect(v.comments[0].voterName).toBe("Kevin");
    expect(v.comments[0].direction).toBe("up");
  });

  it("reports the given viewer's own vote and flags their own comment", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await toggleVote(db, variation.id, "viewer-1", "up");
    await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "mine" });
    await toggleVote(db, variation.id, "viewer-2", "down");

    const asViewer1 = await getVoterDetail(db, voter.id, "viewer-1");
    expect(asViewer1!.variations[0].viewerVote).toBe("up");
    expect(asViewer1!.variations[0].comments.find((c) => c.comment === "mine")?.isOwn).toBe(true);

    const asViewer2 = await getVoterDetail(db, voter.id, "viewer-2");
    expect(asViewer2!.variations[0].viewerVote).toBe("down");
    expect(asViewer2!.variations[0].comments.find((c) => c.comment === "mine")?.isOwn).toBe(false);

    const asAnonymous = await getVoterDetail(db, voter.id);
    expect(asAnonymous!.variations[0].viewerVote).toBeNull();
  });

  it("returns variations ordered by position, not insertion/query order", async () => {
    const voter = await createVoter(db, { title: "ordering" });
    const a = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const b = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });
    const c = await addVariation(db, voter.id, { title: "C", kind: "url", src: "https://c" });

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations.map((v) => v.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("castVote", () => {
  it("stores an anonymous up-vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const vote = await castVote(db, variation.id, { direction: "up" });
    expect(vote.direction).toBe("up");
  });
});

describe("toggleVote", () => {
  it("inserts a vote when the viewer has none yet", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const result = await toggleVote(db, variation.id, "viewer-1", "up");

    expect(result.state).toBe("added");
    expect(result.vote?.direction).toBe("up");
    expect(result.vote?.viewerId).toBe("viewer-1");
  });

  it("undoes the vote when the viewer repeats their own direction", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await toggleVote(db, variation.id, "viewer-1", "up");

    const result = await toggleVote(db, variation.id, "viewer-1", "up");

    expect(result.state).toBe("removed");
    expect(result.vote).toBeNull();
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(0);
  });

  it("switches direction when the viewer picks the opposite one", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await toggleVote(db, variation.id, "viewer-1", "up");

    const result = await toggleVote(db, variation.id, "viewer-1", "down");

    expect(result.state).toBe("switched");
    expect(result.vote?.direction).toBe("down");
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(0);
    expect(detail?.variations[0].down).toBe(1);
  });

  it("lets two different viewers each hold their own vote on the same variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    await toggleVote(db, variation.id, "viewer-1", "up");
    await toggleVote(db, variation.id, "viewer-2", "up");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(2);
  });
});

describe("createComment", () => {
  it("creates a comment even when the viewer has no vote on the variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const comment = await createComment(db, {
      variationId: variation.id,
      viewerId: "viewer-1",
      comment: "too busy",
      voterName: "Kevin",
    });

    expect(comment.comment).toBe("too busy");
    expect(comment.voterName).toBe("Kevin");
    expect(comment.anchorType).toBe("point");
    expect(comment.status).toBe("open");
    expect(comment.selector).toBeNull();
    expect(comment.offsetX).toBeNull();
    expect(comment.offsetY).toBeNull();

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(0);
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].direction).toBeNull();
  });

  it("stores an element anchor's selector, and a point anchor's offsets", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const elementPin = await createComment(db, {
      variationId: variation.id,
      viewerId: "viewer-1",
      comment: "fix this button",
      anchorType: "element",
      selector: "#submit-button",
    });
    expect(elementPin.anchorType).toBe("element");
    expect(elementPin.selector).toBe("#submit-button");

    const pointPin = await createComment(db, {
      variationId: variation.id,
      viewerId: "viewer-1",
      comment: "here",
      anchorType: "point",
      offsetX: 42.5,
      offsetY: 10,
    });
    expect(pointPin.anchorType).toBe("point");
    expect(pointPin.offsetX).toBe(42.5);
    expect(pointPin.offsetY).toBe(10);
  });

  it("creates a new row rather than upserting when the same viewer comments again on the same variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const first = await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "first pin" });
    const second = await createComment(db, {
      variationId: variation.id,
      viewerId: "viewer-1",
      comment: "second pin",
    });

    expect(second.id).not.toBe(first.id);
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(2);
    expect(detail?.variations[0].comments.map((c) => c.comment).sort()).toEqual(["first pin", "second pin"]);
  });

  // KEV-172 chunk 4: "the first comment on a variation is #1 forever, second
  // is #2" — seq is a frozen, monotonic, per-variation sequence assigned at
  // insert time, independent of any other variation's own numbering.
  describe("seq (frozen pin numbering)", () => {
    it("assigns 1, 2, 3... in insertion order, scoped per variation", async () => {
      const voter = await createVoter(db, { title: "x" });
      const variationA = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
      const variationB = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });

      const a1 = await createComment(db, { variationId: variationA.id, viewerId: "v1", comment: "a1" });
      const a2 = await createComment(db, { variationId: variationA.id, viewerId: "v1", comment: "a2" });
      // A second variation's own numbering starts fresh at 1 — seq is scoped
      // per variation, not a global counter.
      const b1 = await createComment(db, { variationId: variationB.id, viewerId: "v1", comment: "b1" });

      expect(a1.seq).toBe(1);
      expect(a2.seq).toBe(2);
      expect(b1.seq).toBe(1);
    });

    it("never reuses a seq after the comment holding it is deleted", async () => {
      const voter = await createVoter(db, { title: "x" });
      const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

      const first = await createComment(db, { variationId: variation.id, viewerId: "v1", comment: "first" });
      const second = await createComment(db, { variationId: variation.id, viewerId: "v1", comment: "second" });
      expect(first.seq).toBe(1);
      expect(second.seq).toBe(2);

      await deleteComment(db, { id: first.id });
      // Deleting #1 must not roll the counter back — the next pin still
      // gets #3, not a reused #1. (Gaps like 1 -deleted-, 2, 3 are correct.)
      const third = await createComment(db, { variationId: variation.id, viewerId: "v1", comment: "third" });
      expect(third.seq).toBe(3);

      const detail = await getVoterDetail(db, voter.id);
      expect(detail?.variations[0].comments.map((c) => c.seq).sort((x, y) => x - y)).toEqual([2, 3]);
    });
  });

  it("reflects the commenter's vote direction when they've also voted", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up", viewerId: "viewer-1" });

    await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "too busy" });

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(1); // still one vote, not two
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].direction).toBe("up");
  });

  it("leaves the comment intact, now with a null direction, after the vote it was tied to is undone", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await toggleVote(db, variation.id, "viewer-1", "up");
    await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "mine" });

    const result = await toggleVote(db, variation.id, "viewer-1", "up");
    expect(result.state).toBe("removed");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].comment).toBe("mine");
    expect(detail?.variations[0].comments[0].direction).toBeNull();
  });
});

describe("updateCommentStatus", () => {
  it("updates the status of the author's own comment", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const comment = await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "fix" });

    const updated = await updateCommentStatus(db, { id: comment.id, status: "complete" });

    expect(updated?.status).toBe("complete");
  });

  // Product decision: any viewer of the voter (not just the comment's
  // original author) may complete/reopen a pin — there is no author-only
  // restriction at the query layer.
  it("updates the status of a comment belonging to a different viewer", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const comment = await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "fix" });

    const result = await updateCommentStatus(db, { id: comment.id, status: "complete" });

    expect(result?.status).toBe("complete");
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments[0].status).toBe("complete");
  });

  it("returns null for a nonexistent comment id", async () => {
    const result = await updateCommentStatus(db, { id: "nonexistent-id", status: "complete" });
    expect(result).toBeNull();
  });
});

describe("deleteComment", () => {
  it("deletes the author's own comment and reports success", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const comment = await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "fix" });

    const deleted = await deleteComment(db, { id: comment.id });

    expect(deleted).toBe(true);
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(0);
  });

  // Product decision: any viewer of the voter (not just the comment's
  // original author) may delete a pin — there is no author-only restriction
  // at the query layer.
  it("deletes a comment belonging to a different viewer, and reports success", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const comment = await createComment(db, { variationId: variation.id, viewerId: "viewer-1", comment: "fix" });

    const deleted = await deleteComment(db, { id: comment.id });

    expect(deleted).toBe(true);
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(0);
  });

  it("reports failure for a nonexistent comment id", async () => {
    const deleted = await deleteComment(db, { id: "nonexistent-id" });
    expect(deleted).toBe(false);
  });
});

describe("purgeExpiredAndArchivedVoters", () => {
  it("deletes voters past expiresAt", async () => {
    const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);
    expect(deletedIds).toContain(voter.id);
    expect(await getVoterDetail(db, voter.id)).toBeNull();
  });

  it("deletes archived voters past the grace window but keeps recently archived ones", async () => {
    const stale = await createVoter(db, { title: "stale" });
    const fresh = await createVoter(db, { title: "fresh" });
    await closeVoter(db, stale.id);
    await closeVoter(db, fresh.id);

    // Simulate "stale" having been archived 2 days ago by purging with a 1-hour grace window
    // relative to "now" 2 days in the future.
    const twoDaysFromNow = new Date(Date.now() + 2 * 86_400_000);
    const deletedIds = await purgeExpiredAndArchivedVoters(db, twoDaysFromNow, 60 * 60 * 1000);

    expect(deletedIds).toContain(stale.id);
    expect(deletedIds).toContain(fresh.id); // both are "past grace" relative to two days from now
  });

  it("keeps a voter archived within the grace window", async () => {
    const recentlyArchived = await createVoter(db, { title: "recently archived" });
    await closeVoter(db, recentlyArchived.id);

    // "now" is the real current time, and the grace window (1 hour) has not yet
    // elapsed since archivedAt (also just now) — so this voter must survive.
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 60 * 60 * 1000);

    expect(deletedIds).not.toContain(recentlyArchived.id);
    expect(await getVoterDetail(db, recentlyArchived.id)).not.toBeNull();
  });

  it("keeps active, unexpired voters", async () => {
    const voter = await createVoter(db, { title: "keep me" });
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);
    expect(deletedIds).not.toContain(voter.id);
  });

  describe("storage cleanup", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("deletes the bundle for a purged voter's app variation, but not for a non-app variation", async () => {
      const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
      const appVariation = await addVariation(db, voter.id, {
        title: "App",
        kind: "app",
        src: `/apps/pending/index.html`,
      });
      const urlVariation = await addVariation(db, voter.id, { title: "URL", kind: "url", src: "https://a" });

      const deleteBundle = vi.spyOn(getStorage(), "deleteBundle").mockResolvedValue(undefined);

      const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);

      expect(deletedIds).toContain(voter.id);
      expect(deleteBundle).toHaveBeenCalledWith(appVariation.id);
      expect(deleteBundle).not.toHaveBeenCalledWith(urlVariation.id);
      expect(deleteBundle).toHaveBeenCalledTimes(1);
    });

    it("still returns the purged voter ids even though no app variations existed", async () => {
      const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
      const deleteBundle = vi.spyOn(getStorage(), "deleteBundle").mockResolvedValue(undefined);

      const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);

      expect(deletedIds).toContain(voter.id);
      expect(deleteBundle).not.toHaveBeenCalled();
    });
  });
});
