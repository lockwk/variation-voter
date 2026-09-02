// scripts/update.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

import { buildManifest, writeManifest, readManifest } from "./lib/voter-source.mjs";
import { runUpdate } from "./update.mjs";

const REPO_SLUG = "lockwk/variation-voter";
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`;

function makeTmpDir(prefix = "update-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function write(dir, relPath, contents) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  return abs;
}

/**
 * Builds a real .tar.gz fixture (via the `tar` binary, wrapped in a
 * top-level directory so downloadAndExtract's --strip-components=1 mirrors
 * a real GitHub source tarball) from a { relPath: contents } map. Returns
 * the tarball bytes as a Buffer, and cleans up its own scratch dir.
 */
function makeReleaseTarball(files) {
  const workDir = makeTmpDir("update-test-fixture-");
  try {
    const root = join(workDir, "release-root");
    for (const [relPath, contents] of Object.entries(files)) {
      write(root, relPath, contents);
    }
    const tarPath = join(workDir, "release.tar.gz");
    execFileSync("tar", ["-czf", tarPath, "-C", workDir, "release-root"]);
    return readFileSync(tarPath);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function makeFetchImpl({ tag, tarballBytes, releaseNotesUrl, notFound = false }) {
  const tarballUrl = `https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/tags/${tag}`;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === RELEASES_LATEST_URL) {
      if (notFound) {
        return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: tag,
          html_url: releaseNotesUrl ?? `https://github.com/${REPO_SLUG}/releases/tag/${tag}`,
        }),
      };
    }
    if (url === tarballUrl) {
      return {
        ok: true,
        arrayBuffer: async () =>
          tarballBytes.buffer.slice(
            tarballBytes.byteOffset,
            tarballBytes.byteOffset + tarballBytes.byteLength
          ),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function fixedNow(iso) {
  return () => new Date(iso);
}

function makeLogger() {
  const lines = [];
  const log = (msg) => lines.push(msg);
  log.lines = lines;
  return log;
}

function listBackupDirs(dir) {
  const backupRoot = join(dir, ".voter-backup");
  if (!existsSync(backupRoot)) return [];
  return execFileSync("ls", [backupRoot]).toString().trim().split("\n").filter(Boolean);
}

describe("runUpdate — already up to date", () => {
  test("prints up-to-date message and makes no changes", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "current page");
      write(dir, "package.json", JSON.stringify({ name: "x", version: "1.0.0" }, null, 2) + "\n");
      const manifest = buildManifest(dir, "v1.0.0");
      writeManifest(dir, manifest);

      const fetchImpl = makeFetchImpl({ tag: "v1.0.0", tarballBytes: Buffer.from("") });
      const log = makeLogger();

      const result = await runUpdate({ cwd: dir, fetchImpl, repoSlug: REPO_SLUG, log });

      assert.equal(result.updated, false);
      assert.ok(log.lines.some((l) => l.includes("already up to date (v1.0.0)")));
      assert.equal(existsSync(join(dir, ".voter-backup")), false);
      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "current page");
      // Only the releases/latest endpoint should have been hit — no download.
      assert.deepEqual(fetchImpl.calls, [RELEASES_LATEST_URL]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — no releases yet", () => {
  test("prints friendly message and makes no changes", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "current page");
      const fetchImpl = makeFetchImpl({ tag: "v1.0.0", tarballBytes: Buffer.from(""), notFound: true });
      const log = makeLogger();

      const result = await runUpdate({ cwd: dir, fetchImpl, repoSlug: REPO_SLUG, log });

      assert.equal(result.updated, false);
      assert.ok(log.lines.some((l) => l.includes("No published releases found yet")));
      assert.equal(existsSync(join(dir, ".voter-backup")), false);
      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "current page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — normal update", () => {
  test("refreshes changed/added files, deletes removed files, preserves .env.local, updates version + manifest", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "old page");
      write(dir, "app/keep.ts", "keep me");
      write(dir, "app/will-be-removed.ts", "bye");
      write(dir, ".env.local", "SECRET=123");
      write(dir, "package.json", JSON.stringify({ name: "variation-voter", version: "1.0.0" }, null, 2) + "\n");

      const manifest = buildManifest(dir, "v1.0.0");
      writeManifest(dir, manifest);

      const tarballBytes = makeReleaseTarball({
        "app/page.tsx": "new page content",
        "app/keep.ts": "keep me",
        "app/new-file.ts": "brand new",
        "package.json": JSON.stringify({ name: "variation-voter", version: "1.0.0" }, null, 2) + "\n",
      });

      const fetchImpl = makeFetchImpl({ tag: "v1.1.0", tarballBytes });
      const log = makeLogger();

      const result = await runUpdate({
        cwd: dir,
        fetchImpl,
        repoSlug: REPO_SLUG,
        now: fixedNow("2026-09-02T16:30:00.000Z"),
        log,
      });

      assert.equal(result.updated, true);
      assert.equal(readFileSync(join(dir, ".env.local"), "utf8"), "SECRET=123");
      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "new page content");
      assert.equal(readFileSync(join(dir, "app/keep.ts"), "utf8"), "keep me");
      assert.equal(readFileSync(join(dir, "app/new-file.ts"), "utf8"), "brand new");
      assert.equal(existsSync(join(dir, "app/will-be-removed.ts")), false);

      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      assert.equal(pkg.version, "1.1.0");

      const newManifest = readManifest(dir);
      assert.equal(newManifest.version, "v1.1.0");
      assert.ok(!("app/will-be-removed.ts" in newManifest.files));
      assert.ok("app/new-file.ts" in newManifest.files);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — edited file backed up", () => {
  test("backs up the user's edited version, and applies the new release content", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "original content");
      write(dir, "package.json", JSON.stringify({ name: "x", version: "1.0.0" }, null, 2) + "\n");
      const manifest = buildManifest(dir, "v1.0.0");
      writeManifest(dir, manifest);

      // Simulate a user edit made after the manifest was captured.
      write(dir, "app/page.tsx", "user edited content");

      const tarballBytes = makeReleaseTarball({
        "app/page.tsx": "release content vNext",
        "package.json": JSON.stringify({ name: "x", version: "1.0.0" }, null, 2) + "\n",
      });
      const fetchImpl = makeFetchImpl({ tag: "v1.1.0", tarballBytes });
      const log = makeLogger();

      await runUpdate({
        cwd: dir,
        fetchImpl,
        repoSlug: REPO_SLUG,
        now: fixedNow("2026-09-02T16:30:00.000Z"),
        log,
      });

      const backupDirs = listBackupDirs(dir);
      assert.deepEqual(backupDirs, ["2026-09-02T16-30-00Z"]);

      const backedUpContent = readFileSync(
        join(dir, ".voter-backup", "2026-09-02T16-30-00Z", "app/page.tsx"),
        "utf8"
      );
      assert.equal(backedUpContent, "user edited content");

      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "release content vNext");
      assert.ok(log.lines.some((l) => l.includes("Backed up") && l.includes("edited file")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — user-added file preserved", () => {
  test("a file never shipped by us stays in place and is not deleted", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "shipped content");
      write(dir, "package.json", JSON.stringify({ name: "x", version: "1.0.0" }, null, 2) + "\n");
      const manifest = buildManifest(dir, "v1.0.0");
      writeManifest(dir, manifest);

      // Added after the manifest snapshot — never tracked, never shipped.
      write(dir, "app/custom.ts", "user added, never shipped");

      const tarballBytes = makeReleaseTarball({
        "app/page.tsx": "shipped content v2",
        "package.json": JSON.stringify({ name: "x", version: "1.0.0" }, null, 2) + "\n",
      });
      const fetchImpl = makeFetchImpl({ tag: "v1.1.0", tarballBytes });
      const log = makeLogger();

      await runUpdate({ cwd: dir, fetchImpl, repoSlug: REPO_SLUG, log });

      assert.equal(existsSync(join(dir, "app/custom.ts")), true);
      assert.equal(readFileSync(join(dir, "app/custom.ts"), "utf8"), "user added, never shipped");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — legacy install (no manifest)", () => {
  test("backs up entire source, refreshes from release, writes fresh manifest, deletes nothing", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "old legacy page");
      write(dir, "other.ts", "other legacy file");
      write(dir, "package.json", JSON.stringify({ name: "x", version: "0.5.0" }, null, 2) + "\n");
      // No .voter-manifest.json — this is a legacy install.

      const tarballBytes = makeReleaseTarball({
        "app/page.tsx": "new legacy page",
        "newfile.ts": "new",
        "package.json": JSON.stringify({ name: "x", version: "0.5.0" }, null, 2) + "\n",
      });
      const fetchImpl = makeFetchImpl({ tag: "v2.0.0", tarballBytes });
      const log = makeLogger();

      const result = await runUpdate({
        cwd: dir,
        fetchImpl,
        repoSlug: REPO_SLUG,
        now: fixedNow("2026-09-02T16:30:00.000Z"),
        log,
      });

      assert.equal(result.updated, true);

      // Entire pre-update source was backed up, including the file that's
      // about to be overwritten and the one left behind.
      const backupBase = join(dir, ".voter-backup", "2026-09-02T16-30-00Z");
      assert.equal(readFileSync(join(backupBase, "app/page.tsx"), "utf8"), "old legacy page");
      assert.equal(readFileSync(join(backupBase, "other.ts"), "utf8"), "other legacy file");

      // Refreshed from the new release.
      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "new legacy page");
      assert.equal(readFileSync(join(dir, "newfile.ts"), "utf8"), "new");

      // Legacy path never deletes — unknown files are left in place.
      assert.equal(existsSync(join(dir, "other.ts")), true);
      assert.equal(readFileSync(join(dir, "other.ts"), "utf8"), "other legacy file");

      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      assert.equal(pkg.version, "2.0.0");

      const newManifest = readManifest(dir);
      assert.ok(newManifest !== null);
      assert.equal(newManifest.version, "v2.0.0");

      assert.ok(log.lines.some((l) => l.toLowerCase().includes("legacy")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no releases yet + legacy install: friendly message, no changes", async () => {
    const dir = makeTmpDir();
    try {
      write(dir, "app/page.tsx", "old legacy page");
      const fetchImpl = makeFetchImpl({ tag: "v2.0.0", tarballBytes: Buffer.from(""), notFound: true });
      const log = makeLogger();

      const result = await runUpdate({ cwd: dir, fetchImpl, repoSlug: REPO_SLUG, log });

      assert.equal(result.updated, false);
      assert.ok(log.lines.some((l) => l.includes("No published releases found yet")));
      assert.equal(existsSync(join(dir, ".voter-backup")), false);
      assert.equal(readFileSync(join(dir, "app/page.tsx"), "utf8"), "old legacy page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
