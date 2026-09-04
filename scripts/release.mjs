#!/usr/bin/env node
// scripts/release.mjs
//
// One-command release script. Bumps the root app's package.json and the
// create-variation-voter scaffolder's package.json to the same version,
// cuts the CHANGELOG.md `## [Unreleased]` section into a dated release,
// commits + tags + pushes, and creates the GitHub release (which is what
// `npx create-variation-voter` and `npm run update-variation-voter` both
// read via the GitHub "latest release" API). A tag push separately
// triggers .github/workflows/release.yml, which publishes the scaffolder
// to npm.
//
// Wired as `npm run release`. The core logic lives in runRelease() so it
// can be exercised end-to-end in tests with injected exec/prompt/now/log
// (no real git, gh, or network calls) — the CLI entry point below is a
// thin wrapper.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses a strict `X.Y.Z` string into { major, minor, patch }, or null. */
export function parseSemver(version) {
  const m = typeof version === "string" ? SEMVER_RE.exec(version) : null;
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Compares two `X.Y.Z` strings; negative/0/positive like Array.sort comparators. */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Cannot compare invalid semver: "${a}" / "${b}"`);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Computes the new version from the current root version and a CLI arg,
 * which is either an explicit `X.Y.Z` or one of patch/minor/major. Throws
 * a plain-language Error for anything invalid, or for a version that
 * isn't strictly greater than the current one.
 */
export function computeNewVersion(currentVersion, arg) {
  const current = parseSemver(currentVersion);
  if (!current) {
    throw new Error(
      `The current version in package.json ("${currentVersion}") isn't a valid X.Y.Z version — fix that first.`
    );
  }

  let next;
  if (arg === "patch") {
    next = `${current.major}.${current.minor}.${current.patch + 1}`;
  } else if (arg === "minor") {
    next = `${current.major}.${current.minor + 1}.0`;
  } else if (arg === "major") {
    next = `${current.major + 1}.0.0`;
  } else if (parseSemver(arg)) {
    next = arg;
  } else {
    throw new Error(
      `"${arg}" isn't a version I understand. Use an exact version like 0.3.0, or one of: patch, minor, major.`
    );
  }

  if (compareSemver(next, currentVersion) <= 0) {
    throw new Error(
      `New version ${next} has to be greater than the current version ${currentVersion}.`
    );
  }

  return next;
}

/**
 * Extracts the text between the `## [Unreleased]` heading and the next
 * `## [` heading (or end of file), trimmed of surrounding blank lines.
 * Returns "" if the section is present but empty. Throws if there's no
 * `## [Unreleased]` heading at all (a malformed CHANGELOG).
 */
export function extractUnreleasedNotes(changelog) {
  const lines = changelog.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === "## [Unreleased]");
  if (startIdx === -1) {
    throw new Error("CHANGELOG.md has no `## [Unreleased]` heading — can't extract release notes.");
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## [")) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join("\n").trim();
}

/**
 * Turns the `## [Unreleased]` heading into a fresh empty `## [Unreleased]`
 * followed by `## [<version>] - <date>`, leaving everything else in the
 * file — including the notes that were under Unreleased, which now sit
 * under the new dated heading — byte-for-byte intact.
 */
export function rewriteChangelogUnreleased(changelog, version, dateStr) {
  const heading = "## [Unreleased]";
  const idx = changelog.indexOf(heading);
  if (idx === -1) {
    throw new Error("CHANGELOG.md has no `## [Unreleased]` heading — can't rewrite it.");
  }
  const before = changelog.slice(0, idx);
  const after = changelog.slice(idx + heading.length);
  return `${before}${heading}\n\n## [${version}] - ${dateStr}${after}`;
}

/** Local YYYY-MM-DD for a Date, matching the CHANGELOG's date format. */
export function formatReleaseDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Rewrites a package.json's "version" field, preserving 2-space formatting. */
function updatePackageJsonVersion(pkgPath, newVersion) {
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = newVersion;
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}${trailingNewline}`);
}

/** Parses CLI args into a version arg and a --yes/-y flag. */
function parseArgs(args) {
  let versionArg = null;
  let yes = false;
  for (const a of args) {
    if (a === "--yes" || a === "-y") {
      yes = true;
    } else if (versionArg === null && !a.startsWith("-")) {
      versionArg = a;
    }
  }
  return { versionArg, yes };
}

function defaultExecFor(cwd) {
  return (command, args = []) => execFileSync(command, args, { cwd, encoding: "utf8" });
}

/**
 * Default prompt: reads a line from stdin via readline. Resolves to null
 * (rather than asking) when stdin isn't a TTY, so a non-interactive run
 * without --yes can be told to abort instead of silently hanging.
 */
async function defaultPrompt(question) {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((res) => rl.question(question, res));
  } finally {
    rl.close();
  }
}

/**
 * Runs the full release flow for the Variation Voter repo at `cwd`.
 *
 * All external effects are injectable so this is fully testable without
 * touching real git/gh/network:
 *  - exec(command, argsArray): runs a command in cwd, returns stdout as a
 *    string, throws on non-zero exit (default: execFileSync).
 *  - prompt(question): returns the user's typed answer, or null if there's
 *    no one to ask (default: readline against stdin, null if not a TTY).
 *  - now: () => Date, used for the CHANGELOG's release date (default: real time).
 *  - log: (string) => void, used for all output (default: console.log).
 */
export async function runRelease({
  cwd,
  args = [],
  exec,
  prompt = defaultPrompt,
  now = () => new Date(),
  log = console.log,
}) {
  const execFn = exec ?? defaultExecFor(cwd);

  const { versionArg, yes } = parseArgs(args);
  if (!versionArg) {
    log("Usage: npm run release <version|patch|minor|major> [--yes]");
    return { released: false, reason: "missing-version-arg" };
  }

  const rootPkgPath = join(cwd, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  const currentVersion = rootPkg.version;

  let newVersion;
  try {
    newVersion = computeNewVersion(currentVersion, versionArg);
  } catch (err) {
    log(err.message);
    return { released: false, reason: "invalid-version" };
  }

  const tag = `v${newVersion}`;

  // --- Preflight ---------------------------------------------------------

  const dirty = execFn("git", ["status", "--porcelain"]).trim();
  if (dirty !== "") {
    log("Your working tree has uncommitted changes. Commit or stash them, then try again.");
    return { released: false, reason: "dirty-tree" };
  }

  const branch = execFn("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "main") {
    log(`You're on branch "${branch}", not "main". Switch to main before releasing.`);
    return { released: false, reason: "wrong-branch" };
  }

  execFn("git", ["fetch"]);

  const behindCount = parseInt(execFn("git", ["rev-list", "--count", "HEAD..origin/main"]).trim(), 10);
  if (Number.isNaN(behindCount)) {
    log("Couldn't tell whether main is up to date with origin/main. Aborting to be safe.");
    return { released: false, reason: "behind-check-failed" };
  }
  if (behindCount > 0) {
    log("Your local main is behind origin/main. Run `git pull`, then try again.");
    return { released: false, reason: "behind-remote" };
  }

  const localTag = execFn("git", ["tag", "--list", tag]).trim();
  if (localTag !== "") {
    log(`Tag ${tag} already exists locally. Pick a different version, or delete the stale tag first.`);
    return { released: false, reason: "tag-exists-local" };
  }

  const remoteTag = execFn("git", ["ls-remote", "--tags", "origin", tag]).trim();
  if (remoteTag !== "") {
    log(`Tag ${tag} already exists on GitHub. Pick a different version.`);
    return { released: false, reason: "tag-exists-remote" };
  }

  try {
    execFn("gh", ["auth", "status"]);
  } catch {
    log('GitHub CLI ("gh") isn\'t installed or isn\'t logged in. Run `gh auth login`, then try again.');
    return { released: false, reason: "gh-not-authenticated" };
  }

  // --- Release notes -------------------------------------------------------

  const changelogPath = join(cwd, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");

  let notes;
  try {
    notes = extractUnreleasedNotes(changelog);
  } catch (err) {
    log(err.message);
    return { released: false, reason: "changelog-malformed" };
  }

  if (notes.trim() === "") {
    log(
      "Nothing to release — add notes under `## [Unreleased]` in CHANGELOG.md first (see CLAUDE.md for the format)."
    );
    return { released: false, reason: "no-release-notes" };
  }

  // --- Confirm -------------------------------------------------------------

  log(`About to release ${tag} (currently ${currentVersion}).`);
  log("");
  log("Release notes:");
  log(notes);
  log("");

  let confirmed = yes;
  if (!confirmed) {
    const answer = await prompt("Publish this release? [y/N] ");
    if (answer === null) {
      log("Not running in an interactive terminal — re-run with --yes to confirm.");
      return { released: false, reason: "no-tty-no-yes" };
    }
    confirmed = /^y(es)?$/i.test(String(answer).trim());
  }

  if (!confirmed) {
    log("Release cancelled. No changes were made.");
    return { released: false, reason: "cancelled" };
  }

  // --- Apply file changes ---------------------------------------------------

  updatePackageJsonVersion(rootPkgPath, newVersion);
  const scaffolderPkgPath = join(cwd, "create-variation-voter", "package.json");
  updatePackageJsonVersion(scaffolderPkgPath, newVersion);

  execFn("npm", ["install", "--package-lock-only", "--ignore-scripts"]);

  const dateStr = formatReleaseDate(now());
  const newChangelog = rewriteChangelogUnreleased(changelog, newVersion, dateStr);
  writeFileSync(changelogPath, newChangelog);

  // --- Commit / tag / push --------------------------------------------------

  execFn("git", ["add", "-A"]);
  execFn("git", ["commit", "-m", `Release ${tag}`]);
  execFn("git", ["tag", "-a", tag, "-m", tag]);
  execFn("git", ["push", "origin", "main", "--follow-tags"]);

  // --- GitHub release --------------------------------------------------------

  execFn("gh", ["release", "create", tag, "--title", tag, "--notes", notes]);

  // --- Summary -----------------------------------------------------------

  log("");
  log(`Released ${tag}.`);
  log("The tag push just triggered the npm publish workflow for create-variation-voter.");
  log("Watch it with `gh run watch` if you want to confirm it goes green.");
  log("Nothing else to do — new installs and `npm run update-variation-voter` will pick this release up automatically.");

  return { released: true, version: newVersion };
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  runRelease({ cwd: process.cwd(), args: process.argv.slice(2) })
    .then((result) => {
      if (!result.released) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
