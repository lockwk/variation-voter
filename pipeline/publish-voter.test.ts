import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseManifest,
  resolveValidVariations,
  publishVoter,
  type VoterManifest,
  type CreateVoterResult,
  type AddAppResult,
  type PublishDeps,
} from "./publish-voter";

// Pure-logic coverage only: the HTTP layer (createVoterRequest/addAppRequest)
// is stubbed via dependency injection, never called for real. distDir/index.html
// checks run against real temp directories on disk (cheap, no network/DB).

describe("parseManifest", () => {
  it("accepts a well-formed manifest", () => {
    const raw = {
      voter: { title: "Nav refresh", description: "which nav feels best?" },
      variations: [
        { title: "A", distDir: "./a" },
        { title: "B", description: "the bold one", distDir: "./b" },
      ],
    };
    expect(parseManifest(raw)).toEqual(raw);
  });

  it("rejects a manifest missing voter.title", () => {
    expect(() => parseManifest({ voter: {}, variations: [{ title: "A", distDir: "./a" }] })).toThrow(/voter.title/);
  });

  it("rejects a manifest with an empty variations array", () => {
    expect(() => parseManifest({ voter: { title: "X" }, variations: [] })).toThrow(/Invalid manifest/);
  });

  it("rejects a variation missing distDir", () => {
    expect(() => parseManifest({ voter: { title: "X" }, variations: [{ title: "A" }] })).toThrow(/distDir/);
  });

  it("rejects non-object input", () => {
    expect(() => parseManifest("not an object")).toThrow(/Invalid manifest/);
    expect(() => parseManifest(null)).toThrow(/Invalid manifest/);
  });
});

describe("resolveValidVariations", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "vv-publish-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeDist(name: string, { withIndexHtml = true } = {}) {
    const dir = path.join(root, name);
    await mkdir(dir, { recursive: true });
    if (withIndexHtml) await writeFile(path.join(dir, "index.html"), "<html></html>");
    return name; // relative path, resolved against `cwd` (root) by the function under test
  }

  it("keeps variations whose distDir has a root index.html", async () => {
    const distDir = await makeDist("good");
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [{ title: "Good", distDir }],
    };

    const { valid, warnings } = resolveValidVariations(manifest, root);

    expect(warnings).toEqual([]);
    expect(valid).toEqual([{ title: "Good", description: undefined, distDir: path.resolve(root, distDir) }]);
  });

  it("skips (and warns about) a distDir lacking index.html", async () => {
    const missing = await makeDist("missing-index", { withIndexHtml: false });
    const good = await makeDist("good");
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [
        { title: "Missing", distDir: missing },
        { title: "Good", distDir: good },
      ],
    };

    const { valid, warnings } = resolveValidVariations(manifest, root);

    expect(valid).toHaveLength(1);
    expect(valid[0].title).toBe("Good");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Missing/);
    expect(warnings[0]).toMatch(/index\.html/);
  });

  it("skips a distDir that doesn't exist at all", () => {
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [{ title: "Ghost", distDir: "does-not-exist" }],
    };

    const { valid, warnings } = resolveValidVariations(manifest, root);

    expect(valid).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe("publishVoter", () => {
  let root: string;
  let createVoter: ReturnType<typeof vi.fn<PublishDeps["createVoter"]>>;
  let addApp: ReturnType<typeof vi.fn<PublishDeps["addApp"]>>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "vv-publish-"));
    createVoter = vi.fn(
      async (): Promise<CreateVoterResult> => ({
        voter: { id: "voter123" },
        shareUrl: "https://example.vercel.app/v/voter123",
      })
    );
    addApp = vi.fn(async (_voterId: string, variation: { title: string }): Promise<AddAppResult> => ({
      variation: { id: `app-${variation.title}` },
    }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeDist(name: string) {
    const dir = path.join(root, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), "<html></html>");
    return name;
  }

  it("aborts without creating a voter when fewer than 2 valid variations remain", async () => {
    const onlyOne = await makeDist("only-one");
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [{ title: "Solo", distDir: onlyOne }],
    };

    await expect(
      publishVoter(manifest, { createVoter, addApp, cwd: root, onWarning: () => {} })
    ).rejects.toThrow(/at least 2/);

    expect(createVoter).not.toHaveBeenCalled();
    expect(addApp).not.toHaveBeenCalled();
  });

  it("aborts (having already created the voter) when fewer than 2 uploads succeed", async () => {
    const a = await makeDist("a");
    const b = await makeDist("b");
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [
        { title: "A", distDir: a },
        { title: "B", distDir: b },
      ],
    };
    addApp.mockRejectedValueOnce(new Error("upload failed: 500 storage error")).mockRejectedValueOnce(new Error("upload failed"));
    const warnings: string[] = [];

    await expect(
      publishVoter(manifest, { createVoter, addApp, cwd: root, onWarning: (message) => warnings.push(message) })
    ).rejects.toThrow(/uploaded successfully/);

    expect(createVoter).toHaveBeenCalledTimes(1);
    expect(addApp).toHaveBeenCalledTimes(2);
    expect(warnings.some((w) => w.includes("A") && w.includes("upload failed: 500 storage error"))).toBe(true);
    expect(warnings.some((w) => w.includes("B") && w.includes("upload failed"))).toBe(true);
  });

  it("creates the voter once and uploads each valid variation once, in manifest order", async () => {
    const badDir = "missing"; // no index.html, never created on disk
    const a = await makeDist("a");
    const b = await makeDist("b");
    const c = await makeDist("c");
    const manifest: VoterManifest = {
      voter: { title: "Nav refresh", description: "pick one" },
      variations: [
        { title: "A", distDir: a },
        { title: "Bad", distDir: badDir },
        { title: "B", distDir: b },
        { title: "C", distDir: c },
      ],
    };
    const warnings: string[] = [];

    const result = await publishVoter(manifest, {
      createVoter,
      addApp,
      cwd: root,
      onWarning: (message) => warnings.push(message),
    });

    expect(createVoter).toHaveBeenCalledTimes(1);
    expect(createVoter).toHaveBeenCalledWith({ title: "Nav refresh", description: "pick one" });

    expect(addApp).toHaveBeenCalledTimes(3);
    expect(addApp.mock.calls.map((call) => call[1].title)).toEqual(["A", "B", "C"]);
    expect(addApp.mock.calls.every((call) => call[0] === "voter123")).toBe(true);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Bad/);

    expect(result).toEqual({
      voterId: "voter123",
      shareUrl: "https://example.vercel.app/v/voter123",
      uploaded: [
        { id: "app-A", title: "A" },
        { id: "app-B", title: "B" },
        { id: "app-C", title: "C" },
      ],
      failed: [],
    });
  });

  it("reports (but doesn't abort on) a partial failure once >=2 uploads still succeed", async () => {
    const a = await makeDist("a");
    const b = await makeDist("b");
    const c = await makeDist("c");
    const manifest: VoterManifest = {
      voter: { title: "V" },
      variations: [
        { title: "A", distDir: a },
        { title: "B", distDir: b },
        { title: "C", distDir: c },
      ],
    };
    addApp.mockImplementation(async (_voterId: string, variation: { title: string }) => {
      if (variation.title === "B") throw new Error("network blip");
      return { variation: { id: `app-${variation.title}` } };
    });

    const result = await publishVoter(manifest, { createVoter, addApp, cwd: root, onWarning: () => {} });

    expect(result.uploaded).toEqual([
      { id: "app-A", title: "A" },
      { id: "app-C", title: "C" },
    ]);
    expect(result.failed).toEqual([{ title: "B", error: "network blip" }]);
  });
});
