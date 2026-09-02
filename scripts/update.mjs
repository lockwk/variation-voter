#!/usr/bin/env node
// scripts/update.mjs
//
// Self-update script for a deployed Variation Voter install. Fetches the
// latest GitHub release, backs up any locally-edited or removed files,
// refreshes app source from the release tarball (skipping preserved
// paths), and rewrites the version marker + manifest.
//
// Wired as `npm run update-variation-voter`. The core logic lives in
// runUpdate() so it can be exercised end-to-end in tests with injected
// fetchImpl/now/log — the CLI entry point below is a thin wrapper.

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPreserved,
  buildManifest,
  writeManifest,
  readManifest,
  diffAgainstManifest,
  fetchLatestRelease,
  downloadAndExtract,
} from "./lib/voter-source.mjs";

const DEFAULT_REPO_SLUG = "lockwk/variation-voter";

/** Recursively lists non-preserved file paths under dir, relative to dir. */
function walkAllFiles(dir, baseDir = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = abs.slice(baseDir.length + 1).split("\\").join("/");
    if (isPreserved(rel)) continue;

    if (entry.isDirectory()) {
      walkAllFiles(abs, baseDir, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/** Filesystem-safe timestamp, e.g. 2026-09-02T16-30-00Z. */
function formatTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

/** Copies each existing relPath from cwd into backupDir, preserving structure. */
function copyIntoBackup({ cwd, relPaths, backupDir }) {
  const backedUp = [];
  for (const rel of relPaths) {
    const src = join(cwd, rel);
    if (!existsSync(src) || !statSync(src).isFile()) continue;
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    backedUp.push(rel);
  }
  return backedUp;
}

/** Copies each relPath from srcDir into destDir, skipping preserved paths. */
function copyFilesInto({ srcDir, destDir, relPaths }) {
  for (const rel of relPaths) {
    if (isPreserved(rel)) continue;
    const src = join(srcDir, rel);
    const dest = join(destDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function stripLeadingV(tag) {
  return tag.replace(/^v/, "");
}

/** Rewrites cwd/package.json's "version" field, preserving 2-space formatting. */
function updatePackageJsonVersion(cwd, newVersion) {
  const pkgPath = join(cwd, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = newVersion;
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}${trailingNewline}`);
}

function readPackageJsonVersion(cwd) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Updates a Variation Voter install at `cwd` to the latest GitHub release.
 *
 * All external effects are injectable so this is fully testable against
 * temp dirs and faked release sources:
 *  - fetchImpl: network fetch (default: global fetch)
 *  - now: () => Date, used to timestamp the backup dir (default: real time)
 *  - log: (string) => void, used for all output (default: console.log)
 */
export async function runUpdate({
  cwd,
  fetchImpl = fetch,
  repoSlug = DEFAULT_REPO_SLUG,
  now = () => new Date(),
  log = console.log,
}) {
  const manifest = readManifest(cwd);

  const latest = await fetchLatestRelease({ fetchImpl, repoSlug });
  if (latest === null) {
    log("No published releases found yet — nothing to update to.");
    return { updated: false, reason: "no-releases" };
  }

  const currentVersion = manifest ? manifest.version : null;

  if (manifest && latest.tag === currentVersion) {
    log(`Variation Voter is already up to date (${currentVersion}).`);
    return { updated: false, reason: "up-to-date", version: currentVersion };
  }

  const displayCurrent = currentVersion ?? readPackageJsonVersion(cwd) ?? "unknown";
  log(`Updating Variation Voter: ${displayCurrent} → ${latest.tag}`);
  log(`Release notes: ${latest.releaseNotesUrl}`);

  const extractDir = mkdtempSync(join(tmpdir(), "variation-voter-update-"));
  const timestamp = formatTimestamp(now());
  const backupDir = join(cwd, ".voter-backup", timestamp);

  try {
    await downloadAndExtract({ source: latest.tarballSourceUrl, target: extractDir, fetchImpl });

    const newFiles = walkAllFiles(extractDir);
    const newFileSet = new Set(newFiles);

    if (manifest) {
      // Normal path: we know exactly what we shipped, so we can tell edits
      // apart from untouched files and back up only what would be lost.
      const diff = diffAgainstManifest(cwd, manifest);
      const toBackup = [...diff.edited, ...diff.removed];
      if (toBackup.length > 0) {
        const backedUp = copyIntoBackup({ cwd, relPaths: toBackup, backupDir });
        log(`Backed up ${backedUp.length} edited file(s) to .voter-backup/${timestamp}/`);
      }

      // Refresh source from the new release (never touching preserved paths).
      copyFilesInto({ srcDir: extractDir, destDir: cwd, relPaths: newFiles });

      // Delete files we used to ship that the new release no longer has.
      // Anything edited was already backed up above; never touch a path
      // that wasn't in the old manifest (that's a user-added file).
      for (const rel of Object.keys(manifest.files)) {
        if (!newFileSet.has(rel) && !isPreserved(rel)) {
          const abs = join(cwd, rel);
          if (existsSync(abs)) rmSync(abs, { force: true });
        }
      }
    } else {
      // Legacy path: no manifest means we can't tell what the user edited,
      // so back up everything before touching anything.
      const allCurrentFiles = walkAllFiles(cwd);
      const backedUp = copyIntoBackup({ cwd, relPaths: allCurrentFiles, backupDir });
      log(
        `Legacy install detected (no manifest) — backed up all ${backedUp.length} file(s) to .voter-backup/${timestamp}/ to be safe.`
      );

      // Refresh from the new release. Never delete: we don't know what we
      // originally shipped, so anything not in the new release is left in
      // place (it's backed up either way).
      copyFilesInto({ srcDir: extractDir, destDir: cwd, relPaths: newFiles });
    }

    // Version marker + manifest come last, so the manifest hashes the final
    // on-disk state (including the rewritten package.json) — otherwise the
    // very next update would falsely flag package.json as user-edited.
    updatePackageJsonVersion(cwd, stripLeadingV(latest.tag));
    const newManifest = buildManifest(cwd, latest.tag);
    writeManifest(cwd, newManifest);

    log("Done. Run `npm install` (dependencies may have changed), then redeploy with `vercel --prod`.");

    return { updated: true, from: displayCurrent, to: latest.tag };
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  runUpdate({ cwd: process.cwd() }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
