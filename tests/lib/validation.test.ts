import { describe, expect, it } from "vitest";
import { createVoterSchema, addVariationSchema, castVoteSchema, updateVoteSchema } from "@/lib/validation";

describe("createVoterSchema", () => {
  it("accepts a title only", () => {
    expect(createVoterSchema.safeParse({ title: "Nav refresh" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(createVoterSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts an optional expiresInDays", () => {
    const result = createVoterSchema.safeParse({ title: "x", expiresInDays: 14 });
    expect(result.success).toBe(true);
  });
});

describe("addVariationSchema", () => {
  it("accepts a url variation", () => {
    const result = addVariationSchema.safeParse({
      title: "Live default",
      kind: "url",
      src: "https://preview.example/a",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid kind", () => {
    const result = addVariationSchema.safeParse({ title: "x", kind: "video", src: "y" });
    expect(result.success).toBe(false);
  });
});

describe("castVoteSchema", () => {
  it("accepts a bare direction", () => {
    expect(castVoteSchema.safeParse({ direction: "up" }).success).toBe(true);
  });

  it("accepts a comment and voterName", () => {
    const result = castVoteSchema.safeParse({
      direction: "down",
      comment: "too busy",
      voterName: "Kevin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid direction", () => {
    expect(castVoteSchema.safeParse({ direction: "sideways" }).success).toBe(false);
  });
});

describe("updateVoteSchema", () => {
  it("accepts a voteId with a comment", () => {
    const result = updateVoteSchema.safeParse({ voteId: "abc123", comment: "too busy" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing voteId", () => {
    expect(updateVoteSchema.safeParse({ comment: "too busy" }).success).toBe(false);
  });
});
