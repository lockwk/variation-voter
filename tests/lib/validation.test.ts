import { describe, expect, it } from "vitest";
import { createVoterSchema, addVariationSchema, castVoteSchema, commentSchema } from "@/lib/validation";

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

  it("accepts expiresInDays of 0 (immediate expiry)", () => {
    const result = createVoterSchema.safeParse({ title: "x", expiresInDays: 0 });
    expect(result.success).toBe(true);
  });
});

describe("addVariationSchema", () => {
  // KEV-172: new "url" variations can no longer be created — they're a
  // cross-origin iframe with no same-document DOM to hit-test, so they can't
  // support pinned comments the way every other kind now requires. Existing
  // rows are untouched (the DB enum still has "url"), only creation is blocked.
  it("rejects a url variation with a clear, specific error", () => {
    const result = addVariationSchema.safeParse({
      title: "Live default",
      kind: "url",
      src: "https://preview.example/a",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/no longer supported/i);
    }
  });

  it("accepts an image variation", () => {
    const result = addVariationSchema.safeParse({
      title: "Screenshot",
      kind: "image",
      src: "https://preview.example/a.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an embed variation", () => {
    const result = addVariationSchema.safeParse({
      title: "Embedded",
      kind: "embed",
      src: "<iframe></iframe>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid kind", () => {
    const result = addVariationSchema.safeParse({ title: "x", kind: "video", src: "y" });
    expect(result.success).toBe(false);
  });

  it("rejects kind:\"app\" — app variations must go through the dedicated /apps upload route, not this generic schema", () => {
    const result = addVariationSchema.safeParse({
      title: "My app",
      kind: "app",
      src: "/api/apps/some-bundle/index.html",
    });
    expect(result.success).toBe(false);
  });
});

describe("castVoteSchema", () => {
  it("accepts a bare direction", () => {
    expect(castVoteSchema.safeParse({ direction: "up" }).success).toBe(true);
  });

  it("rejects an invalid direction", () => {
    expect(castVoteSchema.safeParse({ direction: "sideways" }).success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("accepts a comment on its own", () => {
    const result = commentSchema.safeParse({ comment: "too busy" });
    expect(result.success).toBe(true);
  });

  it("accepts a comment with a voterName", () => {
    const result = commentSchema.safeParse({ comment: "too busy", voterName: "Kevin" });
    expect(result.success).toBe(true);
  });

  it("rejects a voterName without a comment", () => {
    const result = commentSchema.safeParse({ voterName: "Kevin" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty comment", () => {
    const result = commentSchema.safeParse({ comment: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only comment", () => {
    const result = commentSchema.safeParse({ comment: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a body with neither comment nor voterName", () => {
    expect(commentSchema.safeParse({}).success).toBe(false);
  });
});
