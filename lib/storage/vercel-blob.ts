import { put, get, del, list } from "@vercel/blob";
import type { BundleStorage, StoredFile } from "./types";
import { contentTypeFor } from "./mime";

// Vercel Blob driver — used when BLOB_READ_WRITE_TOKEN is set (the
// deployed/Vercel case). See index.ts for driver selection.
//
// Each file in a bundle is stored at the deterministic pathname
// `bundles/<bundleId>/<relativePath>` with `addRandomSuffix: false`, so a
// file's location is derivable from (bundleId, relativePath) alone without
// needing to look anything up first.

/**
 * Reject a bundleId that isn't a single, plain path segment: no `..`, no
 * path separators (`/` or `\`), no NUL. bundleId is normally a fixed-shape
 * nanoid (see lib/ids.ts), but storage shouldn't trust that — defense in
 * depth against a bundleId being used to escape the `bundles/` prefix
 * (parity with the equivalent guard in local-fs.ts).
 */
function isSafeBundleId(bundleId: string): boolean {
  return bundleId.length > 0 && !/[\\/]|\.\.|\0/.test(bundleId);
}

function blobPathname(bundleId: string, filePath: string): string {
  if (!isSafeBundleId(bundleId)) {
    throw new Error(`Refusing to use unsafe bundle id: ${bundleId}`);
  }
  const normalized = filePath.replace(/^\/+/, "");
  return `bundles/${bundleId}/${normalized}`;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export class VercelBlobBundleStorage implements BundleStorage {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async putBundle(bundleId: string, files: Map<string, Uint8Array>): Promise<void> {
    if (!isSafeBundleId(bundleId)) {
      throw new Error(`Refusing to write bundle with unsafe id: ${bundleId}`);
    }

    // Clear any existing bundle first so a re-upload doesn't leave stale
    // files (e.g. from a previous build with different hashed filenames).
    await this.deleteBundle(bundleId);

    await Promise.all(
      Array.from(files.entries()).map(([relativePath, data]) =>
        put(blobPathname(bundleId, relativePath), Buffer.from(data), {
          access: "public",
          token: this.token,
          addRandomSuffix: false,
          contentType: contentTypeFor(relativePath),
        })
      )
    );
  }

  async getFile(bundleId: string, filePath: string): Promise<StoredFile | null> {
    if (!isSafeBundleId(bundleId)) return null;

    const pathname = blobPathname(bundleId, filePath);

    const result = await get(pathname, { access: "public", token: this.token }).catch((error) => {
      if (isNotFoundError(error)) return null;
      throw error;
    });

    if (!result || result.statusCode !== 200) return null;

    const data = await streamToBytes(result.stream);
    return { data, contentType: result.blob.contentType || contentTypeFor(filePath) };
  }

  async deleteBundle(bundleId: string): Promise<void> {
    if (!isSafeBundleId(bundleId)) return;

    const prefix = `bundles/${bundleId}/`;
    let cursor: string | undefined;

    for (;;) {
      const listResult = await list({ prefix, token: this.token, cursor });
      if (listResult.blobs.length > 0) {
        await del(
          listResult.blobs.map((blob) => blob.url),
          { token: this.token }
        );
      }
      if (!listResult.hasMore) break;
      cursor = listResult.cursor;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "BlobNotFoundError";
}
