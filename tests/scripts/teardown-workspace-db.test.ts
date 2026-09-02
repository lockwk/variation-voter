import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const isConfiguredMock = vi.fn();
const deleteBranchMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock("../../lib/neon-branches", () => ({
  isConfigured: isConfiguredMock,
  deleteBranch: deleteBranchMock,
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

describe("teardownWorkspaceDb", () => {
  beforeEach(() => {
    isConfiguredMock.mockReset();
    deleteBranchMock.mockReset();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("delegates to scripts/wipe-dev-db.ts and does not touch Neon when unconfigured", async () => {
    isConfiguredMock.mockReturnValue(false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { teardownWorkspaceDb } = await import("../../scripts/teardown-workspace-db");
    const code = await teardownWorkspaceDb();

    expect(code).toBe(0);
    expect(deleteBranchMock).not.toHaveBeenCalled();
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "npx",
      ["tsx", "scripts/wipe-dev-db.ts"],
      expect.objectContaining({ stdio: "inherit" }),
    );
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("delegating"))).toBe(true);

    logSpy.mockRestore();
  });

  it("propagates a non-zero exit code from the delegated wipe-dev-db.ts run", async () => {
    isConfiguredMock.mockReturnValue(false);
    spawnSyncMock.mockReturnValue({ status: 7 });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { teardownWorkspaceDb } = await import("../../scripts/teardown-workspace-db");
    const code = await teardownWorkspaceDb();

    expect(code).toBe(7);
  });

  it("deletes dev+test Neon branches (and never spawns wipe-dev-db.ts) when configured", async () => {
    isConfiguredMock.mockReturnValue(true);
    vi.stubEnv("CONDUCTOR_WORKSPACE_NAME", "monterrey");
    deleteBranchMock.mockImplementation(async ({ kind }: { kind: "dev" | "test" }) => ({
      deleted: kind === "dev",
    }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { teardownWorkspaceDb } = await import("../../scripts/teardown-workspace-db");
    const code = await teardownWorkspaceDb();

    expect(code).toBe(0);
    expect(deleteBranchMock).toHaveBeenCalledWith({ workspace: "monterrey", kind: "dev" });
    expect(deleteBranchMock).toHaveBeenCalledWith({ workspace: "monterrey", kind: "test" });
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });
});
