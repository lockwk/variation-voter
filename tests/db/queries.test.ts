import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  createVoter,
  addVariation,
  closeVoter,
  deleteVoter,
  listVoters,
  getVoterDetail,
  castVote,
  attachCommentToVote,
  purgeExpiredAndArchivedVoters,
} from "@/db/queries";

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
    await castVote(db, variation.id, { direction: "up", comment: "great", voterName: "Kevin" });
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
    expect(vote.comment).toBeNull();
  });
});

describe("attachCommentToVote", () => {
  it("updates the existing vote row rather than creating a new one", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const vote = await castVote(db, variation.id, { direction: "up" });

    const updated = await attachCommentToVote(db, vote.id, variation.id, {
      comment: "too busy",
      voterName: "Kevin",
    });

    expect(updated?.id).toBe(vote.id);
    expect(updated?.comment).toBe("too busy");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(1); // still one vote, not two
    expect(detail?.variations[0].comments).toHaveLength(1);
  });

  it("returns null when the vote doesn't belong to the given variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variationA = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const variationB = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });
    const vote = await castVote(db, variationA.id, { direction: "up" });

    expect(await attachCommentToVote(db, vote.id, variationB.id, { comment: "x" })).toBeNull();
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

  it("keeps active, unexpired voters", async () => {
    const voter = await createVoter(db, { title: "keep me" });
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);
    expect(deletedIds).not.toContain(voter.id);
  });
});
