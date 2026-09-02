import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const isConfiguredMock = vi.fn();
const createOrReuseBranchMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock("../../lib/neon-branches", () => ({
  isConfigured: isConfiguredMock,
  createOrReuseBranch: createOrReuseBranchMock,
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

describe("provisionWorkspaceDb", () => {
  let dir: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    isConfiguredMock.mockReset();
    createOrReuseBranchMock.mockReset();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    vi.unstubAllEnvs();
  });

  it("no-ops when Neon is not configured: no branches created, no env files touched, no migration run", async () => {
    isConfiguredMock.mockReturnValue(false);
    dir = mkdtempSync(path.join(tmpdir(), "provision-db-test-"));
    process.chdir(dir);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { provisionWorkspaceDb } = await import("../../scripts/provision-workspace-db");

    await provisionWorkspaceDb();

    expect(createOrReuseBranchMock).not.toHaveBeenCalled();
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, ".env.local"))).toBe(false);
    expect(existsSync(path.join(dir, ".env.test.local"))).toBe(false);
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("skipping"))).toBe(true);

    logSpy.mockRestore();
    vi.resetModules();
  });

  it("when configured: creates dev+test branches, rewrites env files preserving other lines, and runs guarded migrate for each with the right confirm host", async () => {
    isConfiguredMock.mockReturnValue(true);
    vi.stubEnv("CONDUCTOR_WORKSPACE_NAME", "monterrey");

    createOrReuseBranchMock.mockImplementation(async ({ kind }: { kind: "dev" | "test" }) => {
      if (kind === "dev") {
        return {
          branchId: "br-dev",
          pooledUri: "postgresql://u@ep-dev-pooler.region.aws.neon.tech/neondb",
          unpooledUri: "postgresql://u@ep-dev.region.aws.neon.tech/neondb",
          host: "ep-dev.region.aws.neon.tech",
        };
      }
      return {
        branchId: "br-test",
        pooledUri: "postgresql://u@ep-test-pooler.region.aws.neon.tech/neondb",
        unpooledUri: "postgresql://u@ep-test.region.aws.neon.tech/neondb",
        host: "ep-test.region.aws.neon.tech",
      };
    });

    dir = mkdtempSync(path.join(tmpdir(), "provision-db-test-"));
    writeFileSync(path.join(dir, ".env.local"), "ADMIN_TOKEN=keep-me\nDATABASE_URL=postgres://old\n");
    writeFileSync(path.join(dir, ".env.test.local"), "DATABASE_URL=postgres://old-test\n");
    process.chdir(dir);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { provisionWorkspaceDb } = await import("../../scripts/provision-workspace-db");

    await provisionWorkspaceDb();

    expect(createOrReuseBranchMock).toHaveBeenCalledWith({ workspace: "monterrey", kind: "dev" });
    expect(createOrReuseBranchMock).toHaveBeenCalledWith({ workspace: "monterrey", kind: "test" });

    const envLocal = readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(envLocal).toContain("ADMIN_TOKEN=keep-me");
    expect(envLocal).toContain("DATABASE_URL=postgresql://u@ep-dev-pooler.region.aws.neon.tech/neondb");
    expect(envLocal).toContain("DATABASE_URL_UNPOOLED=postgresql://u@ep-dev.region.aws.neon.tech/neondb");

    const envTest = readFileSync(path.join(dir, ".env.test.local"), "utf8");
    expect(envTest).toContain("DATABASE_URL=postgresql://u@ep-test-pooler.region.aws.neon.tech/neondb");

    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    const [devCall, testCall] = spawnSyncMock.mock.calls;
    expect(devCall[1]).toEqual(["tsx", "scripts/guarded-migrate.ts", ".env.local"]);
    expect(devCall[2].env.DB_TARGET_CONFIRM_HOST).toBe("ep-dev.region.aws.neon.tech");
    expect(testCall[1]).toEqual(["tsx", "scripts/guarded-migrate.ts", ".env.test.local"]);
    expect(testCall[2].env.DB_TARGET_CONFIRM_HOST).toBe("ep-test-pooler.region.aws.neon.tech");

    logSpy.mockRestore();
    vi.resetModules();
  });

  it("throws when a guarded migration fails", async () => {
    isConfiguredMock.mockReturnValue(true);
    vi.stubEnv("CONDUCTOR_WORKSPACE_NAME", "monterrey");
    createOrReuseBranchMock.mockResolvedValue({
      branchId: "br-x",
      pooledUri: "postgresql://u@ep-pooler.region.aws.neon.tech/neondb",
      unpooledUri: "postgresql://u@ep.region.aws.neon.tech/neondb",
      host: "ep.region.aws.neon.tech",
    });
    spawnSyncMock.mockReturnValue({ status: 1 });

    dir = mkdtempSync(path.join(tmpdir(), "provision-db-test-"));
    process.chdir(dir);

    vi.spyOn(console, "log").mockImplementation(() => {});
    const { provisionWorkspaceDb } = await import("../../scripts/provision-workspace-db");

    await expect(provisionWorkspaceDb()).rejects.toThrow(/migration failed/);

    vi.resetModules();
  });
});
