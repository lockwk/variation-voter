import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readDirToMap } from "@/cli/read-dir-to-map";

describe("readDirToMap", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "vv-dist-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads nested files into a POSIX relative-path map", async () => {
    await writeFile(path.join(root, "index.html"), "<html></html>");
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "assets", "index-ABC123.js"), "console.log(1)");

    const files = await readDirToMap(root);

    expect(files.size).toBe(2);
    expect(new TextDecoder().decode(files.get("index.html"))).toBe("<html></html>");
    expect(new TextDecoder().decode(files.get("assets/index-ABC123.js"))).toBe("console.log(1)");
  });

  it("returns an empty map for an empty directory", async () => {
    const files = await readDirToMap(root);
    expect(files.size).toBe(0);
  });

  it("includes a symlinked file", async () => {
    const targetDir = await mkdtemp(path.join(tmpdir(), "vv-dist-target-"));
    const targetPath = path.join(targetDir, "vendor.js");
    await writeFile(targetPath, "console.log('vendor')");

    try {
      await symlink(targetPath, path.join(root, "vendor.js"));
    } catch (err) {
      // Some environments (e.g. Windows without elevated privileges) can't
      // create symlinks — skip gracefully rather than failing the suite.
      console.warn("Skipping symlink test: unable to create symlink", err);
      await rm(targetDir, { recursive: true, force: true });
      return;
    }

    try {
      const files = await readDirToMap(root);

      expect(new TextDecoder().decode(files.get("vendor.js"))).toBe("console.log('vendor')");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
