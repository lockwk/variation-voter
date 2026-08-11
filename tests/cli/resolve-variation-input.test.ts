import { describe, expect, it } from "vitest";
import { resolveVariationInput } from "@/cli/resolve-variation-input";

describe("resolveVariationInput", () => {
  it("resolves --url to kind 'url'", () => {
    expect(resolveVariationInput({ url: "https://a" })).toEqual(["url", "https://a"]);
  });

  it("resolves --image to kind 'image'", () => {
    expect(resolveVariationInput({ image: "https://a.png" })).toEqual(["image", "https://a.png"]);
  });

  it("resolves --embed to kind 'embed'", () => {
    expect(resolveVariationInput({ embed: "<iframe></iframe>" })).toEqual(["embed", "<iframe></iframe>"]);
  });

  it("throws when none are provided", () => {
    expect(() => resolveVariationInput({})).toThrow(/one of --url, --image, or --embed/i);
  });
});
