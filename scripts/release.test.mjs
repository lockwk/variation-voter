// scripts/release.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import {
  runRelease,
  parseSemver,
  compareSemver,
  computeNewVersion,
  extractUnreleasedNotes,
  rewriteChangelogUnreleased,
  formatReleaseDate,
} from "./release.mjs";

function makeTmpDir(prefix = "release-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function write(dir, relPath, contents) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  return abs;
}

function makeLogger() {
  const lines = [];
  const log = (msg) => lines.push(msg);
  log.lines = lines;
  return log;
}

/**
 * A fully-scripted fake `exec` for git/gh/npm. All preflight conditions
 * default to "everything's fine"; override individual ones to trigger a
 * specific abort path. Records every call (in order) on `.calls`.
 */
function makeFakeExec(overrides = {}) {
  const {
    dirty = "",
    branch = "main",
    behindCount = 0,
    localTag = "",
    remoteTag = "",
    ghAuthOk = true,
  } = overrides;

  const calls = [];
  const exec = (command, args = []) => {
    calls.push({ command, args, key: `${command} ${args.join(" ")}`.trim() });

    if (command === "git" && args[0] === "status") return dirty;
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return `${branch}\n`;
    if (command === "git" && args[0] === "fetch") return "";
    if (command === "git" && args[0] === "rev-list") return `${behindCount}\n`;
    if (command === "git" && args[0] === "tag" && args[1] === "--list") return localTag;
    if (command === "git" && args[0] === "ls-remote") return remoteTag;
    if (command === "gh" && args[0] === "auth") {
      if (!ghAuthOk) throw new Error("gh auth status failed");
      return "Logged in to github.com\n";
    }
    if (command === "npm") return "";
    if (command === "git" && ["add", "commit", "tag", "push"].includes(args[0])) return "";
    if (command === "gh" && args[0] === "release") return "";
    return "";
  };
  exec.calls = calls;
  return exec;
}

function makeFakePrompt(answer) {
  const calls = [];
  const prompt = async (question) => {
    calls.push(question);
    return answer;
  };
  prompt.calls = calls;
  return prompt;
}

// Uses a plain (timezone-less) datetime string so Date parses it in the
// local timezone, matching what formatReleaseDate does with real `now()`.
function fixedNow(localDateTime) {
  return () => new Date(localDateTime);
}

const CHANGELOG_WITH_NOTES = `# Changelog

All notable **user-facing** changes to Variation Voter are recorded here.

## [Unreleased]

### Added

- Some new thing (KEV-100)

## [0.2.0] - 2026-09-02

### Added

- Older thing (KEV-90)
`;

const CHANGELOG_EMPTY_UNRELEASED = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-09-02

### Added

- Older thing (KEV-90)
`;

function setupRepo(dir, { changelog = CHANGELOG_WITH_NOTES, rootVersion = "0.2.0", scaffolderVersion = "0.1.2" } = {}) {
  write(
    dir,
    "package.json",
    JSON.stringify({ name: "variation-voter", version: rootVersion, private: true }, null, 2) + "\n"
  );
  write(
    dir,
    "create-variation-voter/package.json",
    JSON.stringify({ name: "create-variation-voter", version: scaffolderVersion }, null, 2) + "\n"
  );
  write(dir, "CHANGELOG.md", changelog);
}

// --- Pure helpers ------------------------------------------------------------

describe("parseSemver / compareSemver", () => {
  test("parses a clean X.Y.Z", () => {
    assert.deepEqual(parseSemver("1.2.3"), { major: 1, minor: 2, patch: 3 });
  });

  test("rejects anything not X.Y.Z", () => {
    assert.equal(parseSemver("1.2"), null);
    assert.equal(parseSemver("1.2.3-beta"), null);
    assert.equal(parseSemver("v1.2.3"), null);
    assert.equal(parseSemver("abc"), null);
  });

  test("compares versions numerically", () => {
    assert.ok(compareSemver("0.2.1", "0.2.0") > 0);
    assert.ok(compareSemver("0.2.0", "0.2.0") === 0);
    assert.ok(compareSemver("1.0.0", "0.9.9") > 0);
    assert.ok(compareSemver("0.9.9", "1.0.0") < 0);
  });
});

describe("computeNewVersion", () => {
  test("patch/minor/major bump from the current version", () => {
    assert.equal(computeNewVersion("0.2.0", "patch"), "0.2.1");
    assert.equal(computeNewVersion("0.2.0", "minor"), "0.3.0");
    assert.equal(computeNewVersion("0.2.0", "major"), "1.0.0");
  });

  test("accepts an explicit version greater than current", () => {
    assert.equal(computeNewVersion("0.2.0", "0.5.0"), "0.5.0");
  });

  test("rejects an explicit version that is not greater than current", () => {
    assert.throws(() => computeNewVersion("0.2.0", "0.2.0"), /greater/);
    assert.throws(() => computeNewVersion("0.2.0", "0.1.0"), /greater/);
  });

  test("rejects a malformed explicit version", () => {
    assert.throws(() => computeNewVersion("0.2.0", "notaversion"), /isn't a version I understand/);
    assert.throws(() => computeNewVersion("0.2.0", "1.2"), /isn't a version I understand/);
  });
});

describe("extractUnreleasedNotes", () => {
  test("extracts trimmed content between Unreleased and the next heading", () => {
    const notes = extractUnreleasedNotes(CHANGELOG_WITH_NOTES);
    assert.equal(notes, "### Added\n\n- Some new thing (KEV-100)");
  });

  test("returns empty string for an empty Unreleased section", () => {
    const notes = extractUnreleasedNotes(CHANGELOG_EMPTY_UNRELEASED);
    assert.equal(notes, "");
  });

  test("throws if there is no Unreleased heading at all", () => {
    assert.throws(() => extractUnreleasedNotes("# Changelog\n\n## [0.2.0] - 2026-09-02\n"), /Unreleased/);
  });
});

describe("rewriteChangelogUnreleased", () => {
  test("turns Unreleased into a dated heading and re-adds a fresh empty Unreleased", () => {
    const rewritten = rewriteChangelogUnreleased(CHANGELOG_WITH_NOTES, "0.3.0", "2026-09-02");
    assert.equal(
      rewritten,
      `# Changelog

All notable **user-facing** changes to Variation Voter are recorded here.

## [Unreleased]

## [0.3.0] - 2026-09-02

### Added

- Some new thing (KEV-100)

## [0.2.0] - 2026-09-02

### Added

- Older thing (KEV-90)
`
    );
  });
});

describe("formatReleaseDate", () => {
  test("formats a local YYYY-MM-DD", () => {
    assert.equal(formatReleaseDate(new Date(2026, 8, 2)), "2026-09-02");
  });
});

// --- runRelease integration ---------------------------------------------------

describe("runRelease — confirmation", () => {
  test('prompt "n" aborts: no file changes, no git/gh mutation calls', async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const prompt = makeFakePrompt("n");
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt, now: fixedNow("2026-09-10T12:00:00"), log });

      assert.deepEqual(result, { released: false, reason: "cancelled" });

      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      assert.equal(pkg.version, "0.2.0");
      const scaffolderPkg = JSON.parse(readFileSync(join(dir, "create-variation-voter/package.json"), "utf8"));
      assert.equal(scaffolderPkg.version, "0.1.2");
      assert.equal(readFileSync(join(dir, "CHANGELOG.md"), "utf8"), CHANGELOG_WITH_NOTES);

      const mutationCommands = exec.calls.filter((c) =>
        ["add", "commit", "push"].includes(c.args[0]) || (c.command === "git" && c.args[0] === "tag" && c.args[1] !== "--list") || c.command === "npm" || (c.command === "gh" && c.args[0] === "release")
      );
      assert.deepEqual(mutationCommands, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prompt "y" proceeds with the full release flow, in order', async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const prompt = makeFakePrompt("y");
      const log = makeLogger();

      const result = await runRelease({
        cwd: dir,
        args: ["patch"],
        exec,
        prompt,
        now: fixedNow("2026-09-10T12:00:00"),
        log,
      });

      assert.deepEqual(result, { released: true, version: "0.2.1" });

      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      assert.equal(pkg.version, "0.2.1");
      const rawPkg = readFileSync(join(dir, "package.json"), "utf8");
      assert.equal(rawPkg, JSON.stringify({ name: "variation-voter", version: "0.2.1", private: true }, null, 2) + "\n");

      const scaffolderPkg = JSON.parse(readFileSync(join(dir, "create-variation-voter/package.json"), "utf8"));
      assert.equal(scaffolderPkg.version, "0.2.1");

      const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
      assert.match(changelog, /## \[Unreleased\]\n\n## \[0\.2\.1\] - 2026-09-10\n/);
      assert.match(changelog, /- Some new thing \(KEV-100\)/);

      const keys = exec.calls.map((c) => c.key);
      assert.deepEqual(keys, [
        "git status --porcelain",
        "git rev-parse --abbrev-ref HEAD",
        "git fetch",
        "git rev-list --count HEAD..origin/main",
        "git tag --list v0.2.1",
        "git ls-remote --tags origin v0.2.1",
        "gh auth status",
        "npm install --package-lock-only --ignore-scripts",
        "git add -A",
        "git commit -m Release v0.2.1",
        "git tag -a v0.2.1 -m v0.2.1",
        "git push origin main --follow-tags",
        `gh release create v0.2.1 --title v0.2.1 --notes ${"### Added\n\n- Some new thing (KEV-100)"}`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--yes skips the prompt entirely", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const prompt = async () => {
        throw new Error("prompt should not be called when --yes is passed");
      };
      const log = makeLogger();

      const result = await runRelease({
        cwd: dir,
        args: ["patch", "--yes"],
        exec,
        prompt,
        now: fixedNow("2026-09-10T12:00:00"),
        log,
      });

      assert.equal(result.released, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("non-interactive (prompt resolves null) without --yes aborts", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const prompt = async () => null;
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt, now: fixedNow("2026-09-10T12:00:00"), log });

      assert.deepEqual(result, { released: false, reason: "no-tty-no-yes" });
      assert.equal(exec.calls.some((c) => c.command === "npm" || c.args[0] === "commit"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runRelease — preflight aborts", () => {
  test("dirty working tree", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ dirty: " M some-file.ts\n" });
      const prompt = makeFakePrompt("y");
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt, log });

      assert.deepEqual(result, { released: false, reason: "dirty-tree" });
      // Aborted right after the status check — nothing else was run.
      assert.deepEqual(exec.calls.map((c) => c.key), ["git status --porcelain"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("wrong branch", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ branch: "feature-x" });
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "wrong-branch" });
      assert.ok(log.lines.some((l) => l.includes("feature-x")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("local main behind origin/main", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ behindCount: 2 });
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "behind-remote" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tag already exists locally", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ localTag: "v0.2.1\n" });
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "tag-exists-local" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tag already exists on origin", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ remoteTag: "abc123\trefs/tags/v0.2.1\n" });
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "tag-exists-remote" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gh not authenticated", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec({ ghAuthOk: false });
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "gh-not-authenticated" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runRelease — version argument handling", () => {
  test("missing version arg aborts with usage message", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: [], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "missing-version-arg" });
      assert.equal(exec.calls.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid version arg aborts before any git calls", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["not-a-version"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "invalid-version" });
      assert.equal(exec.calls.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("explicit version not greater than current aborts before any git calls", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir);
      const exec = makeFakeExec();
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["0.1.0"], exec, prompt: makeFakePrompt("y"), log });

      assert.deepEqual(result, { released: false, reason: "invalid-version" });
      assert.equal(exec.calls.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runRelease — empty Unreleased section", () => {
  test("aborts before confirming or touching files", async () => {
    const dir = makeTmpDir();
    try {
      setupRepo(dir, { changelog: CHANGELOG_EMPTY_UNRELEASED });
      const exec = makeFakeExec();
      const prompt = async () => {
        throw new Error("prompt should not be called when there's nothing to release");
      };
      const log = makeLogger();

      const result = await runRelease({ cwd: dir, args: ["patch"], exec, prompt, log });

      assert.deepEqual(result, { released: false, reason: "no-release-notes" });
      assert.equal(readFileSync(join(dir, "CHANGELOG.md"), "utf8"), CHANGELOG_EMPTY_UNRELEASED);
      assert.ok(log.lines.some((l) => l.includes("Nothing to release")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
