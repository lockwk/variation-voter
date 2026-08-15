import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { MAX_BUNDLE_FILE_BYTES, unzipBundle } from "./zip";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decode(map: Map<string, Uint8Array>, key: string): string {
  const data = map.get(key);
  if (!data) throw new Error(`missing key: ${key}`);
  return new TextDecoder().decode(data);
}

describe("unzipBundle", () => {
  it("round-trips a flat archive (no wrapping directory) to a relative-path map", async () => {
    const zip = zipSync({
      "index.html": encode("<html>root</html>"),
      "assets/index-ABC123.js": encode("console.log(1)"),
      "assets/logo.png": new Uint8Array([1, 2, 3, 4]),
    });

    const result = await unzipBundle(zip);

    expect(result.size).toBe(3);
    expect(decode(result, "index.html")).toBe("<html>root</html>");
    expect(decode(result, "assets/index-ABC123.js")).toBe("console.log(1)");
    expect(result.get("assets/logo.png")).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("strips a single common top-level directory (e.g. a zip of dist/)", async () => {
    const zip = zipSync({
      "dist/index.html": encode("<html>wrapped</html>"),
      "dist/assets/index-ABC123.js": encode("console.log(2)"),
    });

    const result = await unzipBundle(zip);

    expect(result.size).toBe(2);
    expect(decode(result, "index.html")).toBe("<html>wrapped</html>");
    expect(decode(result, "assets/index-ABC123.js")).toBe("console.log(2)");
    // The wrapping directory itself should not survive as a key.
    expect(result.has("dist/index.html")).toBe(false);
  });

  it("does not strip anything when files exist at multiple top-level locations", async () => {
    const zip = zipSync({
      "index.html": encode("<html>root</html>"),
      "dist/index.html": encode("<html>nested</html>"),
    });

    const result = await unzipBundle(zip);

    expect(result.size).toBe(2);
    expect(decode(result, "index.html")).toBe("<html>root</html>");
    expect(decode(result, "dist/index.html")).toBe("<html>nested</html>");
  });

  it("skips __MACOSX junk and dotfiles like .DS_Store", async () => {
    const zip = zipSync({
      "index.html": encode("<html></html>"),
      "__MACOSX/._index.html": encode("resource fork junk"),
      ".DS_Store": encode("mac junk"),
      "assets/.DS_Store": encode("mac junk nested"),
    });

    const result = await unzipBundle(zip);

    expect(result.size).toBe(1);
    expect(result.has("index.html")).toBe(true);
  });

  it("skips directory entries", async () => {
    const zip = zipSync({
      "index.html": encode("<html></html>"),
      "assets/": new Uint8Array(),
      "assets/logo.png": new Uint8Array([9, 9, 9]),
    });

    const result = await unzipBundle(zip);

    expect(result.size).toBe(2);
    expect(result.has("assets/")).toBe(false);
    expect(result.get("assets/logo.png")).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("rejects a zip-bomb entry whose uncompressed size exceeds the per-file budget", async () => {
    // A large buffer of repeated bytes compresses down to almost nothing but
    // expands back to its full (over-budget) size on decompression.
    const huge = new Uint8Array(MAX_BUNDLE_FILE_BYTES + 1024 * 1024);
    const zip = zipSync({
      "index.html": encode("<html></html>"),
      "assets/bomb.bin": huge,
    });

    await expect(unzipBundle(zip)).rejects.toThrow("Bundle exceeds maximum uncompressed size");
  });
});
