import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { upsertEnvVar, writeEnvUpdates } from "@/lib/env-file";

describe("upsertEnvVar", () => {
  it("appends a new key to empty contents", () => {
    expect(upsertEnvVar("", "DATABASE_URL", "postgres://a")).toBe("DATABASE_URL=postgres://a\n");
  });

  it("appends a new key, preserving existing lines", () => {
    const result = upsertEnvVar("ADMIN_TOKEN=abc\n", "DATABASE_URL", "postgres://a");
    expect(result).toBe("ADMIN_TOKEN=abc\nDATABASE_URL=postgres://a\n");
  });

  it("replaces an existing key in place, preserving other lines and order", () => {
    const result = upsertEnvVar(
      "ADMIN_TOKEN=abc\nDATABASE_URL=postgres://old\nCRON_SECRET=xyz\n",
      "DATABASE_URL",
      "postgres://new",
    );
    expect(result).toBe("ADMIN_TOKEN=abc\nDATABASE_URL=postgres://new\nCRON_SECRET=xyz\n");
  });

  it("adds a trailing newline before appending if the file doesn't end with one", () => {
    const result = upsertEnvVar("ADMIN_TOKEN=abc", "DATABASE_URL", "postgres://a");
    expect(result).toBe("ADMIN_TOKEN=abc\nDATABASE_URL=postgres://a\n");
  });

  it("writes values containing $ literally when replacing an existing key", () => {
    const value = "postgres://user:p$a$$w&rd@host/db";
    const result = upsertEnvVar("DATABASE_URL=postgres://old\n", "DATABASE_URL", value);
    expect(result).toBe(`DATABASE_URL=${value}\n`);
  });
});

describe("writeEnvUpdates", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("creates the file if it doesn't exist yet", () => {
    dir = mkdtempSync(path.join(tmpdir(), "env-file-test-"));
    const filePath = path.join(dir, ".env.local");

    writeEnvUpdates(filePath, { DATABASE_URL: "postgres://a", DATABASE_URL_UNPOOLED: "postgres://a-direct" });

    const contents = readFileSync(filePath, "utf8");
    expect(contents).toContain("DATABASE_URL=postgres://a\n");
    expect(contents).toContain("DATABASE_URL_UNPOOLED=postgres://a-direct\n");
  });

  it("preserves unrelated existing lines and only rewrites the given keys", () => {
    dir = mkdtempSync(path.join(tmpdir(), "env-file-test-"));
    const filePath = path.join(dir, ".env.local");
    writeFileSync(
      filePath,
      "DATABASE_URL=postgres://old\nADMIN_TOKEN=keep-me\nCRON_SECRET=keep-me-too\n",
    );

    writeEnvUpdates(filePath, { DATABASE_URL: "postgres://new" });

    const contents = readFileSync(filePath, "utf8");
    expect(contents).toBe("DATABASE_URL=postgres://new\nADMIN_TOKEN=keep-me\nCRON_SECRET=keep-me-too\n");
  });
});
