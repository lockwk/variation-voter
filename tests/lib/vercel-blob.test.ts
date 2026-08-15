import { describe, expect, it, vi, beforeEach } from "vitest";
import { put, get, del, list } from "@vercel/blob";
import { VercelBlobBundleStorage } from "@/lib/storage/vercel-blob";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
}));

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  const data = bytes(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

const TOKEN = "test-token";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(list).mockResolvedValue({ blobs: [], hasMore: false } as never);
});

describe("VercelBlobBundleStorage", () => {
  describe("putBundle", () => {
    it("calls put per file with public access, no random suffix, and a deterministic bundles/<id>/<path> key", async () => {
      const storage = new VercelBlobBundleStorage(TOKEN);
      const files = new Map([
        ["index.html", bytes("<html></html>")],
        ["assets/index-ABC.js", bytes("console.log(1)")],
      ]);

      await storage.putBundle("bundle1", files);

      expect(put).toHaveBeenCalledWith(
        "bundles/bundle1/index.html",
        Buffer.from(bytes("<html></html>")),
        expect.objectContaining({
          access: "public",
          token: TOKEN,
          addRandomSuffix: false,
          contentType: "text/html; charset=utf-8",
        })
      );
      expect(put).toHaveBeenCalledWith(
        "bundles/bundle1/assets/index-ABC.js",
        Buffer.from(bytes("console.log(1)")),
        expect.objectContaining({
          access: "public",
          token: TOKEN,
          addRandomSuffix: false,
          contentType: "text/javascript; charset=utf-8",
        })
      );
      expect(put).toHaveBeenCalledTimes(2);
    });

    it("clears any existing bundle first via deleteBundle", async () => {
      vi.mocked(list).mockResolvedValueOnce({
        blobs: [{ url: "https://blob.example/bundles/bundle1/old.js" }],
        hasMore: false,
      } as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      await storage.putBundle("bundle1", new Map([["index.html", bytes("hi")]]));

      expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "bundles/bundle1/", token: TOKEN }));
      expect(del).toHaveBeenCalledWith(["https://blob.example/bundles/bundle1/old.js"], { token: TOKEN });
    });
  });

  describe("getFile", () => {
    it("returns bytes and content type on a 200 response", async () => {
      vi.mocked(get).mockResolvedValue({
        statusCode: 200,
        stream: streamOf("<html>hi</html>"),
        blob: { contentType: "text/html; charset=utf-8" },
      } as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      const file = await storage.getFile("bundle1", "index.html");

      expect(get).toHaveBeenCalledWith("bundles/bundle1/index.html", { access: "public", token: TOKEN });
      expect(file).not.toBeNull();
      expect(new TextDecoder().decode(file!.data)).toBe("<html>hi</html>");
      expect(file!.contentType).toBe("text/html; charset=utf-8");
    });

    it("falls back to the extension-derived content type when the blob has none", async () => {
      vi.mocked(get).mockResolvedValue({
        statusCode: 200,
        stream: streamOf("body{}"),
        blob: { contentType: "" },
      } as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      const file = await storage.getFile("bundle1", "assets/app.css");

      expect(file!.contentType).toBe("text/css; charset=utf-8");
    });

    it("returns null when the underlying get() rejects with a not-found error", async () => {
      vi.mocked(get).mockRejectedValue({ name: "BlobNotFoundError" });

      const storage = new VercelBlobBundleStorage(TOKEN);
      const file = await storage.getFile("bundle1", "nope.html");

      expect(file).toBeNull();
    });

    it("returns null when get() resolves to null", async () => {
      vi.mocked(get).mockResolvedValue(null as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      const file = await storage.getFile("bundle1", "nope.html");

      expect(file).toBeNull();
    });
  });

  describe("deleteBundle", () => {
    it("lists with cursor pagination across pages and deletes all matching blobs", async () => {
      vi.mocked(list)
        .mockResolvedValueOnce({
          blobs: [{ url: "https://blob.example/bundles/bundle1/a.js" }],
          hasMore: true,
          cursor: "cursor-1",
        } as never)
        .mockResolvedValueOnce({
          blobs: [{ url: "https://blob.example/bundles/bundle1/b.js" }],
          hasMore: false,
        } as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      await storage.deleteBundle("bundle1");

      expect(list).toHaveBeenCalledTimes(2);
      expect(list).toHaveBeenNthCalledWith(1, { prefix: "bundles/bundle1/", token: TOKEN, cursor: undefined });
      expect(list).toHaveBeenNthCalledWith(2, { prefix: "bundles/bundle1/", token: TOKEN, cursor: "cursor-1" });

      expect(del).toHaveBeenCalledTimes(2);
      expect(del).toHaveBeenNthCalledWith(1, ["https://blob.example/bundles/bundle1/a.js"], { token: TOKEN });
      expect(del).toHaveBeenNthCalledWith(2, ["https://blob.example/bundles/bundle1/b.js"], { token: TOKEN });
    });

    it("does not call del when a page has no blobs", async () => {
      vi.mocked(list).mockResolvedValueOnce({ blobs: [], hasMore: false } as never);

      const storage = new VercelBlobBundleStorage(TOKEN);
      await storage.deleteBundle("bundle1");

      expect(del).not.toHaveBeenCalled();
    });
  });
});
