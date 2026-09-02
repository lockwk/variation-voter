// create-variation-voter/index.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { install } from "./index.mjs";

const REPO_SLUG = "lockwk/variation-voter";

function makeTmpDir(prefix = "cvv-test-") {
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

function makeFixtureTarball({ extraFiles = {} } = {}) {
  const workDir = makeTmpDir("cvv-fixture-");
  const fixtureRoot = join(workDir, "fixture-root");
  write(
    fixtureRoot,
    "package.json",
    `${JSON.stringify({ name: "variation-voter", version: "0.0.0", private: true }, null, 2)}\n`
  );
  write(fixtureRoot, "app/page.tsx", "export default function Page() { return null; }\n");
  write(fixtureRoot, "README.md", "# Variation Voter\n");
  for (const [relPath, contents] of Object.entries(extraFiles)) {
    write(fixtureRoot, relPath, contents);
  }

  const tarPath = join(workDir, "fixture.tar.gz");
  execFileSync("tar", ["-czf", tarPath, "-C", workDir, "fixture-root"]);
  return { workDir, tarPath };
}

function withOverrideSource(tarPath, fn) {
  const prev = process.env.VARIATION_VOTER_SOURCE;
  process.env.VARIATION_VOTER_SOURCE = tarPath;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.VARIATION_VOTER_SOURCE;
      else process.env.VARIATION_VOTER_SOURCE = prev;
    });
}

test("install via VARIATION_VOTER_SOURCE override extracts files, writes .env.local and manifest", async () => {
  const { workDir, tarPath } = makeFixtureTarball();
  const target = makeTmpDir("cvv-target-override-");
  try {
    const result = await withOverrideSource(tarPath, () => install({ target, log: () => {} }));

    assert.equal(readFileSync(join(target, "README.md"), "utf8"), "# Variation Voter\n");
    assert.equal(
      readFileSync(join(target, "app/page.tsx"), "utf8"),
      "export default function Page() { return null; }\n"
    );

    const envContents = readFileSync(join(target, ".env.local"), "utf8");
    assert.match(envContents, /ADMIN_TOKEN=[0-9a-f]{48}/);
    assert.match(envContents, /CRON_SECRET=[0-9a-f]{48}/);

    const manifest = JSON.parse(readFileSync(join(target, ".voter-manifest.json"), "utf8"));
    assert.deepEqual(
      Object.keys(manifest.files).sort(),
      ["README.md", "app/page.tsx", "package.json"].sort()
    );
    assert.equal(manifest.files["README.md"], sha256("# Variation Voter\n"));
    assert.equal(
      manifest.files["app/page.tsx"],
      sha256("export default function Page() { return null; }\n")
    );

    // override installs have no real tag, so package.json version is left untouched
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.version, "0.0.0");

    assert.equal(result.version, "override");
    assert.equal(manifest.version, "override");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("install from latest release sets package.json version and manifest tag", async () => {
  const { workDir, tarPath } = makeFixtureTarball();
  const target = makeTmpDir("cvv-target-release-");
  const tarballBytes = readFileSync(tarPath);

  const fakeFetch = async (url) => {
    if (url === `https://api.github.com/repos/${REPO_SLUG}/releases/latest`) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: "v1.0.0",
          html_url: `https://github.com/${REPO_SLUG}/releases/tag/v1.0.0`,
        }),
      };
    }
    if (url === `https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/tags/v1.0.0`) {
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

  try {
    const result = await install({ target, fetchImpl: fakeFetch, log: () => {} });

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.0.0");

    const manifest = JSON.parse(readFileSync(join(target, ".voter-manifest.json"), "utf8"));
    assert.equal(manifest.version, "v1.0.0");
    assert.equal(result.version, "v1.0.0");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("falls back to main branch and prints a note when no release exists yet (404)", async () => {
  const { workDir, tarPath } = makeFixtureTarball();
  const target = makeTmpDir("cvv-target-fallback-");
  const tarballBytes = readFileSync(tarPath);
  const logs = [];

  const fakeFetch = async (url) => {
    if (url === `https://api.github.com/repos/${REPO_SLUG}/releases/latest`) {
      return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
    }
    if (url === `https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/main`) {
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

  try {
    const result = await install({
      target,
      fetchImpl: fakeFetch,
      log: (msg) => logs.push(msg),
    });

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.version, "0.0.0"); // left untouched for the fallback

    const manifest = JSON.parse(readFileSync(join(target, ".voter-manifest.json"), "utf8"));
    assert.equal(manifest.version, "main");
    assert.equal(result.version, "main");

    assert.ok(
      logs.some((line) => /main/i.test(line) && /release/i.test(line)),
      `expected a log line noting the main-branch fallback, got: ${JSON.stringify(logs)}`
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("manifest excludes preserved paths (.env.local, .vercel)", async () => {
  const { workDir, tarPath } = makeFixtureTarball({
    extraFiles: {
      ".vercel/project.json": "{}",
      ".vercel/nested/deep.json": "{}",
    },
  });
  const target = makeTmpDir("cvv-target-preserved-");
  try {
    await withOverrideSource(tarPath, () => install({ target, log: () => {} }));

    const manifest = JSON.parse(readFileSync(join(target, ".voter-manifest.json"), "utf8"));
    const keys = Object.keys(manifest.files);
    assert.ok(!keys.includes(".env.local"));
    assert.ok(!keys.some((k) => k === ".vercel" || k.startsWith(".vercel/")));
    assert.ok(keys.includes("README.md"));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("throws when target directory exists and is not empty", async () => {
  const target = makeTmpDir("cvv-target-nonempty-");
  writeFileSync(join(target, "existing.txt"), "hi");
  try {
    await assert.rejects(
      () => install({ target, log: () => {} }),
      /already exists and is not empty/
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
