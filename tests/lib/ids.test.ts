import { describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("generates a 10-character lowercase-alphanumeric id", () => {
    expect(newId()).toMatch(/^[0-9a-z]{10}$/);
  });

  it("generates distinct ids across calls", () => {
    expect(newId()).not.toBe(newId());
  });
});
