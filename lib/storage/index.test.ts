import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getStorage", () => {
  it("memoizes the same instance across calls", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const { getStorage } = await import("./index");

    const first = getStorage();
    const second = getStorage();

    expect(first).toBe(second);
  });

  it("selects the local-fs driver when BLOB_READ_WRITE_TOKEN is unset", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const { getStorage } = await import("./index");
    const { LocalFsBundleStorage } = await import("./local-fs");
    const { VercelBlobBundleStorage } = await import("./vercel-blob");

    const storage = getStorage();

    expect(storage).toBeInstanceOf(LocalFsBundleStorage);
    expect(storage).not.toBeInstanceOf(VercelBlobBundleStorage);
  });

  it("selects the vercel-blob driver when BLOB_READ_WRITE_TOKEN is set", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    const { getStorage } = await import("./index");
    const { VercelBlobBundleStorage } = await import("./vercel-blob");
    const { LocalFsBundleStorage } = await import("./local-fs");

    const storage = getStorage();

    expect(storage).toBeInstanceOf(VercelBlobBundleStorage);
    expect(storage).not.toBeInstanceOf(LocalFsBundleStorage);
  });
});
