import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import {
  neonConfig,
  isConfigured,
  branchName,
  createOrReuseBranch,
  deleteBranch,
} from "@/lib/neon-branches";

// This suite mocks global fetch end-to-end — it must never hit the real Neon
// API (see KEV-187: no live Neon dependency in CI).

const PROJECT_ID = "proj-123";

function mockFetchJson(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
}

describe("neonConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns null when NEON_API_KEY is missing", () => {
    vi.stubEnv("NEON_API_KEY", undefined);
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    expect(neonConfig()).toBeNull();
  });

  it("returns null when NEON_PROJECT_ID is missing", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", undefined);
    expect(neonConfig()).toBeNull();
  });

  it("defaults dev/test parent branch names when unset", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("NEON_DEV_PARENT_BRANCH", undefined);
    vi.stubEnv("NEON_TEST_PARENT_BRANCH", undefined);

    expect(neonConfig()).toEqual({
      apiKey: "key123",
      projectId: PROJECT_ID,
      devParentBranch: "damp-sky",
      testParentBranch: "rapid-glade",
    });
  });

  it("honors explicit parent branch overrides", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("NEON_DEV_PARENT_BRANCH", "custom-dev");
    vi.stubEnv("NEON_TEST_PARENT_BRANCH", "custom-test");

    const config = neonConfig();
    expect(config?.devParentBranch).toBe("custom-dev");
    expect(config?.testParentBranch).toBe("custom-test");
  });
});

describe("isConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false when Neon config is missing, even if local", () => {
    vi.stubEnv("NEON_API_KEY", undefined);
    vi.stubEnv("NEON_PROJECT_ID", undefined);
    vi.stubEnv("CONDUCTOR_IS_LOCAL", "1");
    expect(isConfigured()).toBe(false);
  });

  it("is false when Neon config is present but not local", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("CONDUCTOR_IS_LOCAL", undefined);
    expect(isConfigured()).toBe(false);
  });

  it("is false when CONDUCTOR_IS_LOCAL is '0'", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("CONDUCTOR_IS_LOCAL", "0");
    expect(isConfigured()).toBe(false);
  });

  it("is true only when Neon config is present AND CONDUCTOR_IS_LOCAL === '1'", () => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("CONDUCTOR_IS_LOCAL", "1");
    expect(isConfigured()).toBe(true);
  });
});

describe("branchName", () => {
  it("derives a deterministic cw/<workspace>-<kind> name", () => {
    expect(branchName("monterrey", "dev")).toBe("cw/monterrey-dev");
    expect(branchName("monterrey", "test")).toBe("cw/monterrey-test");
  });
});

describe("createOrReuseBranch", () => {
  beforeEach(() => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("NEON_DEV_PARENT_BRANCH", undefined);
    vi.stubEnv("NEON_TEST_PARENT_BRANCH", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws if called while unconfigured", async () => {
    vi.stubEnv("NEON_API_KEY", undefined);
    await expect(createOrReuseBranch({ workspace: "monterrey", kind: "dev" })).rejects.toThrow();
  });

  it("reuses an existing branch by name without creating a duplicate", async () => {
    const fetchMock = mockFetchJson((url, init) => {
      if (url.includes("/branches") && !url.includes("databases") && (!init || init.method === undefined)) {
        return { branches: [{ id: "br-existing", name: "cw/monterrey-dev", parent_id: "br-parent" }] };
      }
      if (url.includes("/databases")) {
        return { databases: [{ name: "neondb", owner_name: "neondb_owner" }] };
      }
      if (url.includes("connection_uri") && url.includes("pooled=true")) {
        return { uri: "postgresql://neondb_owner@ep-cw-dev-pooler.region.aws.neon.tech/neondb" };
      }
      if (url.includes("connection_uri") && url.includes("pooled=false")) {
        return { uri: "postgresql://neondb_owner@ep-cw-dev.region.aws.neon.tech/neondb" };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrReuseBranch({ workspace: "monterrey", kind: "dev" });

    expect(result).toEqual({
      branchId: "br-existing",
      pooledUri: "postgresql://neondb_owner@ep-cw-dev-pooler.region.aws.neon.tech/neondb",
      unpooledUri: "postgresql://neondb_owner@ep-cw-dev.region.aws.neon.tech/neondb",
      host: "ep-cw-dev.region.aws.neon.tech",
    });

    // No POST (create) call should have been made.
    const postCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(0);
  });

  it("creates a branch from the parent when no existing branch matches", async () => {
    const fetchMock = mockFetchJson((url, init) => {
      const method = init?.method;
      if (url.endsWith("/branches") && method === undefined) {
        // No cw/monterrey-dev branch yet, but the parent (damp-sky) exists.
        return { branches: [{ id: "br-parent", name: "damp-sky" }] };
      }
      if (url.endsWith("/branches") && method === "POST") {
        const parsedBody = JSON.parse(init!.body as string);
        expect(parsedBody.branch.parent_id).toBe("br-parent");
        expect(parsedBody.branch.name).toBe("cw/monterrey-dev");
        return { branch: { id: "br-new", name: "cw/monterrey-dev", parent_id: "br-parent" } };
      }
      if (url.includes("/databases")) {
        return { databases: [{ name: "neondb", owner_name: "neondb_owner" }] };
      }
      if (url.includes("connection_uri") && url.includes("pooled=true")) {
        return { uri: "postgresql://neondb_owner@ep-cw-dev-pooler.region.aws.neon.tech/neondb" };
      }
      if (url.includes("connection_uri") && url.includes("pooled=false")) {
        return { uri: "postgresql://neondb_owner@ep-cw-dev.region.aws.neon.tech/neondb" };
      }
      throw new Error(`Unexpected fetch: ${url} ${method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrReuseBranch({ workspace: "monterrey", kind: "dev" });
    expect(result.branchId).toBe("br-new");

    const postCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(1);
  });

  it("throws a clear error when the configured parent branch doesn't exist", async () => {
    const fetchMock = mockFetchJson((url) => {
      if (url.endsWith("/branches")) {
        return { branches: [{ id: "br-other", name: "some-other-branch" }] };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrReuseBranch({ workspace: "monterrey", kind: "dev" })).rejects.toThrow(
      /parent branch/i,
    );
  });
});

describe("deleteBranch", () => {
  beforeEach(() => {
    vi.stubEnv("NEON_API_KEY", "key123");
    vi.stubEnv("NEON_PROJECT_ID", PROJECT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws if called while unconfigured", async () => {
    vi.stubEnv("NEON_API_KEY", undefined);
    await expect(deleteBranch({ workspace: "monterrey", kind: "dev" })).rejects.toThrow();
  });

  it("is a no-op (deleted: false) when the branch doesn't exist", async () => {
    const fetchMock = mockFetchJson((url) => {
      if (url.endsWith("/branches")) {
        return { branches: [] };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteBranch({ workspace: "monterrey", kind: "test" });
    expect(result).toEqual({ deleted: false });

    const deleteCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it("deletes the branch when found", async () => {
    const fetchMock = mockFetchJson((url, init) => {
      if (url.endsWith("/branches") && init?.method === undefined) {
        return { branches: [{ id: "br-to-delete", name: "cw/monterrey-test" }] };
      }
      if (url.includes("br-to-delete") && init?.method === "DELETE") {
        return {};
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteBranch({ workspace: "monterrey", kind: "test" });
    expect(result).toEqual({ deleted: true });

    const deleteCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(1);
  });
});
