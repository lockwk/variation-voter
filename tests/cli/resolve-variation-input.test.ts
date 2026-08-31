import { describe, expect, it } from "vitest";
import { resolveVariationInput } from "@/cli/resolve-variation-input";

describe("resolveVariationInput", () => {
  // KEV-172: --url is still a recognized flag (so a caller who types it gets
  // this specific message rather than commander's generic "unknown option"),
  // but it's rejected — new "url" variations can no longer be created.
  it("throws a clear error when --url is provided", () => {
    expect(() => resolveVariationInput({ url: "https://a" })).toThrow(/no longer supported/i);
  });

  it("resolves --image to kind 'image'", () => {
    expect(resolveVariationInput({ image: "https://a.png" })).toEqual(["image", "https://a.png"]);
  });

  it("resolves --embed to kind 'embed'", () => {
    expect(resolveVariationInput({ embed: "<iframe></iframe>" })).toEqual(["embed", "<iframe></iframe>"]);
  });

  it("throws when none are provided", () => {
    expect(() => resolveVariationInput({})).toThrow(/one of --image or --embed/i);
  });
});
