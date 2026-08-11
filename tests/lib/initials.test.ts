import { describe, expect, it } from "vitest";
import { initialsFor } from "@/lib/initials";

describe("initialsFor", () => {
  it("returns the first letter of a single-word name", () => {
    expect(initialsFor("Kevin")).toBe("K");
  });

  it("returns first+last initials for a multi-word name", () => {
    expect(initialsFor("Kevin Lockwood")).toBe("KL");
  });

  it("falls back to '?' for null", () => {
    expect(initialsFor(null)).toBe("?");
  });

  it("falls back to '?' for an empty or whitespace-only name", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});
