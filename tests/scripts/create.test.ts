import { describe, expect, it, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string | undefined;
let fixtureDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  tempDir = undefined;
  fixtureDir = undefined;
});

function buildFixtureTarball(): string {
  fixtureDir = mkdtempSync(join(tmpdir(), "variation-voter-fixture-"));
  const wrapperDir = join(fixtureDir, "app-main");
  mkdirSync(wrapperDir, { recursive: true });
  writeFileSync(join(wrapperDir, "package.json"), JSON.stringify({ name: "app-main" }));

  const tarballPath = join(fixtureDir, "app.tgz");
  execFileSync("tar", ["-czf", tarballPath, "-C", fixtureDir, "app-main"]);
  return tarballPath;
}

function runCreateScript(
  input: string,
  targetArg: string
): Promise<{ code: number | null; stdout: string; target: string }> {
  tempDir = mkdtempSync(join(tmpdir(), "variation-voter-create-"));
  const sourceTarball = buildFixtureTarball();
  const target = join(tempDir, targetArg);
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [join(process.cwd(), "create-variation-voter/index.mjs"), targetArg],
      {
        cwd: tempDir,
        env: { ...process.env, VARIATION_VOTER_SOURCE: sourceTarball },
      }
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) => resolve({ code, stdout, target }));
  });
}

describe("create-variation-voter/index.mjs", () => {
  it("fetches the app into the target dir and writes a .env.local with the provided DATABASE_URL and generated secrets", async () => {
    const { code, target } = await runCreateScript(
      "postgres://scratch\nhttps://my-app.vercel.app\n",
      "app"
    );
    expect(code).toBe(0);

    // The tarball's top-level app-main/ wrapper should be stripped, so the
    // sentinel file lands directly at <target>/package.json.
    const sentinel = readFileSync(join(target, "package.json"), "utf8");
    expect(sentinel).toContain("app-main");

    const contents = readFileSync(join(target, ".env.local"), "utf8");
    expect(contents).toContain("DATABASE_URL=postgres://scratch");
    expect(contents).toContain("PUBLIC_BASE_URL=https://my-app.vercel.app");
    expect(contents).toMatch(/ADMIN_TOKEN=[0-9a-f]{48}/);
    expect(contents).toMatch(/CRON_SECRET=[0-9a-f]{48}/);
  });
});
