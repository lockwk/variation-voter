// scripts/lib/voter-source.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import {
  PRESERVE,
  isPreserved,
  hashFile,
  buildManifest,
  writeManifest,
  readManifest,
  diffAgainstManifest,
  fetchLatestRelease,
  downloadAndExtract,
} from "./voter-source.mjs";

function makeTmpDir(prefix = "voter-source-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function write(dir, relPath, contents) {
  const abs = join(dir, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
  return abs;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

describe("PRESERVE / isPreserved", () => {
  test("PRESERVE contains the expected top-level entries", () => {
    const expected = [
      ".env.local",
      ".vercel",
      ".git",
      "node_modules",
      ".voter-backup",
      ".voter-manifest.json",
    ];
    for (const entry of expected) {
      assert.ok(
        PRESERVE.some((p) => p.replace(/\/$/, "") === entry),
        `expected PRESERVE to include ${entry}`
      );
    }
  });

  test("returns true for exact top-level matches", () => {
    assert.equal(isPreserved(".env.local"), true);
    assert.equal(isPreserved(".voter-manifest.json"), true);
    assert.equal(isPreserved("node_modules"), true);
  });

  test("returns true for nested paths inside preserved directories", () => {
    assert.equal(isPreserved(".vercel/foo.json"), true);
    assert.equal(isPreserved(".git/HEAD"), true);
    assert.equal(isPreserved("node_modules/some-pkg/index.js"), true);
    assert.equal(isPreserved(".voter-backup/2024-01-01/app.tsx"), true);
  });

  test("returns false for unrelated paths, including lookalikes", () => {
    assert.equal(isPreserved("app/page.tsx"), false);
    assert.equal(isPreserved("scripts/lib/voter-source.mjs"), false);
    assert.equal(isPreserved(".env.production"), false);
    assert.equal(isPreserved("node_modules_backup/foo.js"), false);
  });
});

describe("hashFile", () => {
  test("returns the sha256 hex digest of file contents", () => {
    const dir = makeTmpDir();
    try {
      const abs = write(dir, "hello.txt", "hello world");
      assert.equal(hashFile(abs), sha256("hello world"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("buildManifest / writeManifest / readManifest", () => {
  test("includes nested files, excludes preserved paths, sorted and deterministic", () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "page contents");
      write(dir, "app/nested/deep.ts", "deep contents");
      write(dir, "README.md", "readme contents");
      write(dir, ".env.local", "SECRET=1");
      write(dir, ".vercel/project.json", "{}");
      write(dir, ".git/HEAD", "ref: refs/heads/main");
      write(dir, "node_modules/pkg/index.js", "module.exports = {}");
      write(dir, ".voter-backup/old/app.tsx", "old contents");
      write(dir, ".voter-manifest.json", "{}");

      const manifest = buildManifest(dir, "1.2.3");

      assert.equal(manifest.version, "1.2.3");
      assert.deepEqual(Object.keys(manifest.files), [
        "README.md",
        "app/nested/deep.ts",
        "app/page.tsx",
      ]);
      assert.equal(manifest.files["app/page.tsx"], sha256("page contents"));
      assert.equal(manifest.files["app/nested/deep.ts"], sha256("deep contents"));
      assert.equal(manifest.files["README.md"], sha256("readme contents"));

      // keys are sorted
      const keys = Object.keys(manifest.files);
      const sorted = [...keys].sort();
      assert.deepEqual(keys, sorted);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("round-trips through write/read", () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "page contents");
      const manifest = buildManifest(dir, "9.9.9");
      writeManifest(dir, manifest);

      const raw = readFileSync(join(dir, ".voter-manifest.json"), "utf8");
      assert.ok(raw.endsWith("\n"));

      const readBack = readManifest(dir);
      assert.deepEqual(readBack, manifest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("readManifest returns null when the manifest file is absent", () => {
    const dir = makeTmpDir();
    try {
      assert.equal(readManifest(dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("diffAgainstManifest", () => {
  test("detects edited, unchanged, and removed files, and ignores user-added files", () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "original page");
      write(dir, "app/unchanged.ts", "same content");
      write(dir, "app/removed.ts", "will be removed");

      const manifest = buildManifest(dir, "1.0.0");

      // Now mutate the working directory to simulate user edits.
      write(dir, "app/page.tsx", "user-edited page");
      rmSync(join(dir, "app/removed.ts"));
      write(dir, "app/user-added.ts", "brand new file, never shipped");

      const diff = diffAgainstManifest(dir, manifest);

      assert.deepEqual(diff.edited, ["app/page.tsx"]);
      assert.deepEqual(diff.unchanged, ["app/unchanged.ts"]);
      assert.deepEqual(diff.removed, ["app/removed.ts"]);

      const allTracked = [...diff.edited, ...diff.unchanged, ...diff.removed];
      assert.ok(!allTracked.includes("app/user-added.ts"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fetchLatestRelease", () => {
  test("returns tag/tarballSourceUrl/releaseNotesUrl from a successful response", async () => {
    const repoSlug = "lockwk/variation-voter";
    const fakeFetch = async (url) => {
      assert.equal(url, `https://api.github.com/repos/${repoSlug}/releases/latest`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: "v1.4.0",
          html_url: `https://github.com/${repoSlug}/releases/tag/v1.4.0`,
        }),
      };
    };

    const result = await fetchLatestRelease({ fetchImpl: fakeFetch, repoSlug });
    assert.deepEqual(result, {
      tag: "v1.4.0",
      tarballSourceUrl: `https://codeload.github.com/${repoSlug}/tar.gz/refs/tags/v1.4.0`,
      releaseNotesUrl: `https://github.com/${repoSlug}/releases/tag/v1.4.0`,
    });
  });

  test("returns null when GitHub responds 404 (no releases yet)", async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not Found" }),
    });

    const result = await fetchLatestRelease({
      fetchImpl: fakeFetch,
      repoSlug: "lockwk/variation-voter",
    });
    assert.equal(result, null);
  });
});

describe("downloadAndExtract", () => {
  function makeFixtureTarball() {
    const workDir = makeTmpDir("voter-source-fixture-");
    const fixtureRoot = join(workDir, "fixture-root");
    write(fixtureRoot, "app/page.tsx", "fixture page");
    write(fixtureRoot, "README.md", "fixture readme");

    const tarPath = join(workDir, "fixture.tar.gz");
    execFileSync("tar", ["-czf", tarPath, "-C", workDir, "fixture-root"]);

    return { workDir, tarPath };
  }

  test("extracts from a local file source with --strip-components=1 applied", async () => {
    const { workDir, tarPath } = makeFixtureTarball();
    const target = makeTmpDir("voter-source-target-");
    try {
      await downloadAndExtract({ source: tarPath, target });

      assert.equal(readFileSync(join(target, "app/page.tsx"), "utf8"), "fixture page");
      assert.equal(readFileSync(join(target, "README.md"), "utf8"), "fixture readme");
      // strip-components=1 means the "fixture-root" wrapper dir must NOT appear.
      assert.throws(() => readFileSync(join(target, "fixture-root/README.md"), "utf8"));
    } finally {
      rmSync(workDir, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("extracts from an http(s) source via injected fetchImpl", async () => {
    const { workDir, tarPath } = makeFixtureTarball();
    const target = makeTmpDir("voter-source-target-http-");
    try {
      const tarballBytes = readFileSync(tarPath);
      const fakeFetch = async (url) => {
        assert.equal(url, "https://codeload.example.com/fake/tar.gz/refs/tags/v1.0.0");
        return {
          ok: true,
          arrayBuffer: async () => tarballBytes.buffer.slice(
            tarballBytes.byteOffset,
            tarballBytes.byteOffset + tarballBytes.byteLength
          ),
        };
      };

      await downloadAndExtract({
        source: "https://codeload.example.com/fake/tar.gz/refs/tags/v1.0.0",
        target,
        fetchImpl: fakeFetch,
      });

      assert.equal(readFileSync(join(target, "app/page.tsx"), "utf8"), "fixture page");
      assert.equal(readFileSync(join(target, "README.md"), "utf8"), "fixture readme");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });
});
