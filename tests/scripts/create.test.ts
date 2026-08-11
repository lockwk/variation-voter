import { describe, expect, it, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function runCreateScript(input: string): Promise<{ code: number | null; stdout: string }> {
  tempDir = mkdtempSync(join(tmpdir(), "variation-voter-create-"));
  return new Promise((resolve) => {
    const child = spawn("node", [join(process.cwd(), "scripts/create.mjs")], {
      cwd: tempDir,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

describe("scripts/create.mjs", () => {
  it("writes a .env.local with the provided DATABASE_URL and generated secrets", async () => {
    const { code } = await runCreateScript("postgres://scratch\nhttps://my-app.vercel.app\n");
    expect(code).toBe(0);
    const contents = readFileSync(join(tempDir!, ".env.local"), "utf8");
    expect(contents).toContain("DATABASE_URL=postgres://scratch");
    expect(contents).toContain("PUBLIC_BASE_URL=https://my-app.vercel.app");
    expect(contents).toMatch(/ADMIN_TOKEN=[0-9a-f]{48}/);
    expect(contents).toMatch(/CRON_SECRET=[0-9a-f]{48}/);
  });
});
