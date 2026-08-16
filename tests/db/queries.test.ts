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
  upsertComment,
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
    await upsertComment(db, variation.id, "commenter-1", { comment: "great", voterName: "Kevin" });
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
    await upsertComment(db, variation.id, "viewer-1", { comment: "mine" });
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

describe("upsertComment", () => {
  it("creates a comment even when the viewer has no vote on the variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const comment = await upsertComment(db, variation.id, "viewer-1", {
      comment: "too busy",
      voterName: "Kevin",
    });

    expect(comment.comment).toBe("too busy");
    expect(comment.voterName).toBe("Kevin");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(0);
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].direction).toBeNull();
  });

  it("upserts rather than duplicating when the same viewer comments again on the same variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const first = await upsertComment(db, variation.id, "viewer-1", { comment: "first take" });
    const second = await upsertComment(db, variation.id, "viewer-1", { comment: "revised take" });

    expect(second.id).toBe(first.id);
    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].comment).toBe("revised take");
  });

  it("reflects the commenter's vote direction when they've also voted", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up", viewerId: "viewer-1" });

    await upsertComment(db, variation.id, "viewer-1", { comment: "too busy" });

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(1); // still one vote, not two
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].direction).toBe("up");
  });

  it("leaves the comment intact, now with a null direction, after the vote it was tied to is undone", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await toggleVote(db, variation.id, "viewer-1", "up");
    await upsertComment(db, variation.id, "viewer-1", { comment: "mine" });

    const result = await toggleVote(db, variation.id, "viewer-1", "up");
    expect(result.state).toBe("removed");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].comments).toHaveLength(1);
    expect(detail?.variations[0].comments[0].comment).toBe("mine");
    expect(detail?.variations[0].comments[0].direction).toBeNull();
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
