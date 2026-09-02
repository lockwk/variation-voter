#!/usr/bin/env node
// create-variation-voter/index.mjs
//
// NOTE: this package is published to npm on its own (only this folder's
// contents ship in the tarball), so it stays dependency-free — node
// builtins only — and does NOT import from ../scripts/lib/voter-source.mjs.
// The manifest-building helpers below intentionally mirror that shared
// library's logic/format exactly (byte-compatible output) so that
// scripts/update.mjs can read a manifest written by this installer.
import { createHash, randomBytes } from "node:crypto";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_SLUG = "lockwk/variation-voter";

// ---------------------------------------------------------------------------
// Fingerprint manifest (mirrors scripts/lib/voter-source.mjs exactly)
// ---------------------------------------------------------------------------

const PRESERVE = [
  ".env.local",
  ".vercel",
  ".git",
  "node_modules",
  ".voter-backup",
  ".voter-manifest.json",
];

const MANIFEST_FILENAME = ".voter-manifest.json";

function normalizeRelPath(relPath) {
  return relPath.split("\\").join("/").replace(/^\.\//, "");
}

function isPreserved(relPath) {
  const normalized = normalizeRelPath(relPath);
  return PRESERVE.some((entry) => {
    const prefix = entry.replace(/\/$/, "");
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

function hashFile(absPath) {
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

function buildManifest(dir, version) {
  const relPaths = walkFiles(dir, dir, []).sort();
  const files = {};
  for (const rel of relPaths) {
    files[rel] = hashFile(join(dir, rel));
  }
  return { version, files };
}

function writeManifest(dir, manifest) {
  writeFileSync(join(dir, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Source resolution: latest GitHub release, falling back to `main` when the
// repo has no tagged releases yet. VARIATION_VOTER_SOURCE always wins.
// ---------------------------------------------------------------------------

async function fetchLatestReleaseTag({ fetchImpl, repoSlug }) {
  // GitHub 403s requests without a User-Agent; Accept pins the response schema.
  const res = await fetchImpl(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
    headers: {
      "User-Agent": "create-variation-voter",
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch latest release for ${repoSlug}: ${res.status}`);
  }

  const data = await res.json();
  return { tag: data.tag_name };
}

async function resolveSource({ fetchImpl, repoSlug, log }) {
  const override = process.env.VARIATION_VOTER_SOURCE;
  if (override) {
    return { source: override, version: "override" };
  }

  const release = await fetchLatestReleaseTag({ fetchImpl, repoSlug });
  if (release === null) {
    log(
      "No tagged release found for this repo yet — installing from the `main` branch instead. " +
        "Once a release is published, `npx create-variation-voter` will install from it automatically."
    );
    return {
      source: `https://codeload.github.com/${repoSlug}/tar.gz/refs/heads/main`,
      version: "main",
    };
  }

  return {
    source: `https://codeload.github.com/${repoSlug}/tar.gz/refs/tags/${release.tag}`,
    version: release.tag,
  };
}

// ---------------------------------------------------------------------------
// Download + extract
// ---------------------------------------------------------------------------

async function fetchTarball(source, fetchImpl) {
  if (source.startsWith("http")) {
    const res = await fetchImpl(source);
    if (!res.ok) {
      throw new Error(`Failed to download app archive: ${res.status} ${res.statusText ?? ""} (${source})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(source);
}

function extractTarball(tarballBytes, target) {
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

// ---------------------------------------------------------------------------
// package.json version mirror
// ---------------------------------------------------------------------------

function stripLeadingV(tag) {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

function updatePackageJsonVersion(target, version) {
  const pkgPath = join(target, "package.json");
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Installer
// ---------------------------------------------------------------------------

/**
 * Installs a fresh Variation Voter app into `target`.
 *
 * @param {object} opts
 * @param {string} opts.target - directory to install into (created if missing).
 * @param {typeof fetch} [opts.fetchImpl] - injectable fetch, for tests.
 * @param {string} [opts.repoSlug] - "owner/repo" to install from.
 * @param {(msg: string) => void} [opts.log] - injectable logger, for tests.
 * @returns {Promise<{ target: string, version: string }>}
 */
export async function install({ target, fetchImpl = fetch, repoSlug = REPO_SLUG, log = console.log } = {}) {
  if (!target) {
    throw new Error("target is required");
  }

  let createdTarget = false;
  if (existsSync(target)) {
    if (readdirSync(target).length > 0) {
      throw new Error(`Target directory "${target}" already exists and is not empty.`);
    }
  } else {
    mkdirSync(target, { recursive: true });
    createdTarget = true;
  }

  try {
    log(`Downloading Variation Voter into ${target}...`);

    const { source, version } = await resolveSource({ fetchImpl, repoSlug, log });
    const tarballBytes = await fetchTarball(source, fetchImpl);
    extractTarball(tarballBytes, target);

    const envPath = join(target, ".env.local");
    if (existsSync(envPath)) {
      throw new Error(".env.local already exists — remove it first if you want to re-run setup.");
    }

    const adminToken = randomBytes(24).toString("hex");
    const cronSecret = randomBytes(24).toString("hex");

    const envContents = [
      `ADMIN_TOKEN=${adminToken}`,
      `CRON_SECRET=${cronSecret}`,
      "",
      "# Filled automatically by the Vercel-Neon integration (or `vercel env pull`).",
      "# For the manual path, paste your Neon direct/unpooled connection string here.",
      "# DATABASE_URL=",
      "",
      "# Set this to your deployed URL after the first deploy.",
      "# PUBLIC_BASE_URL=",
      "",
    ].join("\n");

    writeFileSync(envPath, envContents);

    log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");

    // Only real, tagged releases get mirrored into package.json's version —
    // "main" and "override" installs don't correspond to a real version.
    if (version !== "main" && version !== "override") {
      updatePackageJsonVersion(target, stripLeadingV(version));
    }

    // Build the manifest LAST, after the package.json edit, so the recorded
    // hashes match the final on-disk files.
    const manifest = buildManifest(target, version);
    writeManifest(target, manifest);

    log("Next steps:");
    log(`  1. cd ${target} && npm install`);
    log("  2. vercel link");
    log(
      "  3. vercel integration add neon --plan free_v3 -m auth=false   (accept terms in browser once; injects DATABASE_URL)"
    );
    log("  4. vercel blob create-store <name> --access public --yes       (injects BLOB_READ_WRITE_TOKEN)");
    log("  5. vercel env add ADMIN_TOKEN production   and   vercel env add CRON_SECRET production");
    log("  6. vercel --prod                                               (first deploy; runs migrations)");
    log("  7. set PUBLIC_BASE_URL to your deployed URL, then vercel --prod again");
    log("  8. verify, then set VARIATION_VOTER_URL + VARIATION_VOTER_ADMIN_TOKEN in .env.local");

    return { target, version };
  } catch (err) {
    if (createdTarget) rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npx create-variation-voter <dir>");
    process.exit(1);
  }

  await install({ target });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
