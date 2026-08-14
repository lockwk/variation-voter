import { describe, expect, it } from "vitest";
import { validateBundleFiles, MAX_BUNDLE_FILE_COUNT } from "@/lib/bundle-validation";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("validateBundleFiles", () => {
  it("accepts a typical Vite dist bundle", () => {
    const files = new Map([
      ["index.html", bytes("<html></html>")],
      ["assets/index-ABC123.js", bytes("console.log(1)")],
      ["assets/index-ABC123.css", bytes("body{}")],
      ["assets/logo.png", new Uint8Array([1, 2, 3])],
      ["favicon.ico", new Uint8Array([4, 5, 6])],
    ]);

    expect(validateBundleFiles(files)).toEqual({ ok: true });
  });

  it("rejects a bundle missing a root index.html", () => {
    const files = new Map([["assets/index-ABC123.js", bytes("console.log(1)")]]);

    const result = validateBundleFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/index\.html/i);
  });

  it("rejects a disallowed file extension", () => {
    const files = new Map([
      ["index.html", bytes("<html></html>")],
      ["assets/server.php", bytes("<?php echo 'hi'; ?>")],
    ]);

    const result = validateBundleFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/server\.php/);
  });

  it("rejects a file with no extension", () => {
    const files = new Map([
      ["index.html", bytes("<html></html>")],
      ["assets/LICENSE", bytes("MIT")],
    ]);

    expect(validateBundleFiles(files).ok).toBe(false);
  });

  it("rejects a bundle with more than the max file count", () => {
    const files = new Map<string, Uint8Array>([["index.html", bytes("<html></html>")]]);
    for (let i = 0; i < MAX_BUNDLE_FILE_COUNT; i++) {
      files.set(`assets/file-${i}.js`, bytes("x"));
    }

    const result = validateBundleFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too many files/i);
  });
});
