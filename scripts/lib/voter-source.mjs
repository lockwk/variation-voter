// scripts/lib/voter-source.mjs
//
// Pure, side-effect-free (on import) library backing both the self-update
// script (scripts/update.mjs) and the installer (create-variation-voter).
// No top-level work happens here — every exported function is called
// explicitly by its caller.

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Top-level paths (relative to a Variation Voter install root) that the
 * updater must never touch, fingerprint, overwrite, or delete. Directories
 * are listed without a trailing slash; isPreserved() treats them as
 * covering everything nested inside.
 */
export const PRESERVE = [
  ".env.local",
  ".vercel",
  ".git",
  "node_modules",
  ".voter-backup",
  ".voter-manifest.json",
];

function normalizeRelPath(relPath) {
  return relPath.split("\\").join("/").replace(/^\.\//, "");
}

/**
 * True if relPath is equal to, or nested inside, one of the PRESERVE
 * entries. e.g. isPreserved(".vercel/foo.json") === true.
 */
export function isPreserved(relPath) {
  const normalized = normalizeRelPath(relPath);
  return PRESERVE.some((entry) => {
    const prefix = entry.replace(/\/$/, "");
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

/** Hex sha256 digest of a file's contents. */
export function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function walkFiles(dir, baseDir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = normalizeRelPath(abs.slice(baseDir.length + 1));
    if (isPreserved(rel)) continue;

    if (entry.isDirectory()) {
      walkFiles(abs, baseDir, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
    // symlinks and other special files are ignored
  }
  return out;
}

/**
 * Builds a manifest of every file under dir (recursively), excluding
 * anything matched by isPreserved. Keys are sorted for deterministic
 * output. `version` is supplied by the caller (e.g. the installed
 * release tag) — this function does not infer it.
 */
export function buildManifest(dir, version) {
  const relPaths = walkFiles(dir, dir, []).sort();
  const files = {};
  for (const rel of relPaths) {
    files[rel] = hashFile(join(dir, rel));
  }
  return { version, files };
}

const MANIFEST_FILENAME = ".voter-manifest.json";

/** Writes the manifest as pretty JSON (trailing newline) to dir/.voter-manifest.json. */
export function writeManifest(dir, manifest) {
  writeFileSync(join(dir, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Reads dir/.voter-manifest.json, or returns null if it doesn't exist (legacy install). */
export function readManifest(dir) {
  const path = join(dir, MANIFEST_FILENAME);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Compares the CURRENT contents of dir against the hashes recorded in
 * manifest.files. Files on disk that aren't in the manifest (user-added,
 * never shipped by us) are ignored entirely — they must never be deleted
 * by the updater.
 */
export function diffAgainstManifest(dir, manifest) {
  const edited = [];
  const unchanged = [];
  const removed = [];

  for (const rel of Object.keys(manifest.files).sort()) {
    const abs = join(dir, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      removed.push(rel);
      continue;
    }
    const currentHash = hashFile(abs);
    if (currentHash === manifest.files[rel]) {
      unchanged.push(rel);
    } else {
      edited.push(rel);
    }
  }

  return { edited, unchanged, removed };
}

/**
 * Fetches the latest GitHub release for repoSlug ("owner/repo") and
 * derives the tarball/source-tag download URL. Returns null if the repo
 * has no releases yet (404). fetchImpl is injectable so tests never hit
 * real GitHub.
 */
export async function fetchLatestRelease({ fetchImpl = fetch, repoSlug }) {
  // GitHub's API rejects requests without a User-Agent (403); Accept pins the
  // response schema. Tests inject a fake fetchImpl that ignores these.
  const res = await fetchImpl(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
    headers: {
      "User-Agent": "variation-voter-updater",
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch latest release for ${repoSlug}: ${res.status}`);
  }

  const data = await res.json();
  const tag = data.tag_name;
  return {
    tag,
    tarballSourceUrl: `https://codeload.github.com/${repoSlug}/tar.gz/refs/tags/${tag}`,
    releaseNotesUrl: data.html_url,
  };
}

async function fetchTarballBytes(source, fetchImpl) {
  if (source.startsWith("http")) {
    const res = await fetchImpl(source);
    if (!res.ok) {
      throw new Error(`Failed to download app archive: ${res.status} ${res.statusText ?? ""} (${source})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(source);
}

/**
 * Downloads (http/https via fetchImpl) or reads (local file path) a
 * .tar.gz and extracts it into target with --strip-components=1, mirroring
 * create-variation-voter/index.mjs's install-time extraction logic.
 */
export async function downloadAndExtract({ source, target, fetchImpl = fetch }) {
  const tarballBytes = await fetchTarballBytes(source, fetchImpl);

  mkdirSync(target, { recursive: true });

  const tmpFile = join(tmpdir(), `variation-voter-${randomBytes(8).toString("hex")}.tar.gz`);
  writeFileSync(tmpFile, tarballBytes);

  try {
    try {
      execFileSync("tar", ["-xzf", tmpFile, "-C", target, "--strip-components=1"], {
        stdio: "inherit",
      });
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new Error(
          "`tar` was not found on this system. Install tar (or extract the app manually) and try again."
        );
      }
      throw new Error(`Failed to extract app archive: ${err.message}`);
    }
  } finally {
    rmSync(tmpFile, { force: true });
  }
}
