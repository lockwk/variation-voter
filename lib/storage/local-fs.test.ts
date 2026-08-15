import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFsBundleStorage } from "./local-fs";

describe("LocalFsBundleStorage", () => {
  let root: string;
  let storage: LocalFsBundleStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "vv-bundles-"));
    storage = new LocalFsBundleStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores and retrieves an html file with the right bytes and content type", async () => {
    const html = new TextEncoder().encode("<!doctype html><html></html>");
    await storage.putBundle("bundle1", new Map([["index.html", html]]));

    const file = await storage.getFile("bundle1", "index.html");
    expect(file).not.toBeNull();
    expect(file!.data).toEqual(html);
    expect(file!.contentType).toBe("text/html; charset=utf-8");
  });

  it("stores and retrieves a nested asset file", async () => {
    const js = new TextEncoder().encode("console.log('hi')");
    await storage.putBundle(
      "bundle1",
      new Map([
        ["index.html", new TextEncoder().encode("<html></html>")],
        ["assets/index-ABC123.js", js],
      ])
    );

    const file = await storage.getFile("bundle1", "assets/index-ABC123.js");
    expect(file).not.toBeNull();
    expect(file!.data).toEqual(js);
    expect(file!.contentType).toBe("text/javascript; charset=utf-8");
  });

  it("normalizes a leading slash on the requested file path", async () => {
    const css = new TextEncoder().encode("body { color: red; }");
    await storage.putBundle("bundle1", new Map([["assets/app.css", css]]));

    const file = await storage.getFile("bundle1", "/assets/app.css");
    expect(file).not.toBeNull();
    expect(file!.data).toEqual(css);
  });

  it("returns null for a missing file", async () => {
    await storage.putBundle("bundle1", new Map([["index.html", new TextEncoder().encode("hi")]]));
    const file = await storage.getFile("bundle1", "nope.html");
    expect(file).toBeNull();
  });

  it("returns null for a missing bundle", async () => {
    const file = await storage.getFile("does-not-exist", "index.html");
    expect(file).toBeNull();
  });

  it("removes all files on deleteBundle, idempotently", async () => {
    await storage.putBundle("bundle1", new Map([["index.html", new TextEncoder().encode("hi")]]));
    await storage.deleteBundle("bundle1");

    expect(await storage.getFile("bundle1", "index.html")).toBeNull();

    // Deleting again (already absent) should not throw.
    await expect(storage.deleteBundle("bundle1")).resolves.toBeUndefined();
  });

  it("overwrites a previous bundle's files on re-put, dropping stale ones", async () => {
    await storage.putBundle(
      "bundle1",
      new Map([
        ["index.html", new TextEncoder().encode("old")],
        ["assets/old-ABC.js", new TextEncoder().encode("old js")],
      ])
    );
    await storage.putBundle("bundle1", new Map([["index.html", new TextEncoder().encode("new")]]));

    const indexFile = await storage.getFile("bundle1", "index.html");
    expect(new TextDecoder().decode(indexFile!.data)).toBe("new");

    const staleFile = await storage.getFile("bundle1", "assets/old-ABC.js");
    expect(staleFile).toBeNull();
  });

  it("rejects path traversal in getFile and does not escape the bundle dir", async () => {
    await storage.putBundle("bundle1", new Map([["index.html", new TextEncoder().encode("hi")]]));
    const file = await storage.getFile("bundle1", "../bundle1/index.html");
    expect(file).toBeNull();
  });

  it("rejects path traversal in putBundle", async () => {
    await expect(
      storage.putBundle("bundle1", new Map([["../escaped.html", new TextEncoder().encode("evil")]]))
    ).rejects.toThrow();
  });

  it("rejects a bundleId containing '..' in getFile and does not escape bundlesRoot", async () => {
    // Plant a file just outside bundlesRoot that a traversal would target.
    const outside = path.join(root, "..", "escaped.html");
    await writeFile(outside, "evil");
    try {
      const file = await storage.getFile("../" + path.basename(root), "escaped.html");
      expect(file).toBeNull();
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("rejects a bundleId containing '..' in putBundle", async () => {
    await expect(
      storage.putBundle("../escaped", new Map([["index.html", new TextEncoder().encode("evil")]]))
    ).rejects.toThrow();
  });

  it("rejects a bundleId containing a path separator in getFile", async () => {
    const file = await storage.getFile("bundle1/../../escaped", "index.html");
    expect(file).toBeNull();
  });

  it("rejects a bundleId containing a path separator in putBundle", async () => {
    await expect(
      storage.putBundle("nested/id", new Map([["index.html", new TextEncoder().encode("evil")]]))
    ).rejects.toThrow();
  });

  it("does not delete outside bundlesRoot when deleteBundle is given a traversal bundleId", async () => {
    const outsideDir = path.join(root, "..", "vv-should-not-be-deleted");
    await mkdir(outsideDir, { recursive: true });
    try {
      await storage.deleteBundle("../" + path.basename(outsideDir));
      await expect(stat(outsideDir)).resolves.toBeDefined();
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});
