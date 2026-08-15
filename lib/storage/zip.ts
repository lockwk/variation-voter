import { Unzip, UnzipInflate } from "fflate";
import type { UnzipFile } from "fflate";

/**
 * Path segments to treat as junk and drop entirely — macOS's resource-fork
 * shadow directory and dotfiles like `.DS_Store` that editors/OSes sneak
 * into archives.
 */
function isJunkPath(zipPath: string): boolean {
  const segments = zipPath.split("/").filter(Boolean);
  return segments.some((segment) => segment === "__MACOSX" || segment.startsWith("."));
}

/** Per-file uncompressed size cap. */
export const MAX_BUNDLE_FILE_BYTES = 10 * 1024 * 1024;
/** Total uncompressed size cap across the whole bundle. */
export const MAX_BUNDLE_TOTAL_BYTES = 100 * 1024 * 1024;

/**
 * How much of the *compressed* input we feed the decompressor at a time.
 * Deflate's worst-case expansion ratio is bounded (~1032:1), so feeding
 * small chunks bounds the amount of decompressed output produced by any one
 * decode step — which is what lets us abort as soon as the running total
 * crosses budget instead of only finding out after a giant buffer has
 * already been materialized.
 */
const FEED_CHUNK_BYTES = 32 * 1024;

const BUNDLE_SIZE_ERROR = "Bundle exceeds maximum uncompressed size";

/**
 * Unzip a bundle archive (a built React app's static output) into a
 * relative-path -> bytes map, ready for `BundleStorage.putBundle`.
 *
 * Directory entries and junk paths (`__MACOSX`, dotfiles) are dropped. If
 * every remaining file lives under one shared top-level directory (e.g. a
 * zip of `dist/` produces `dist/index.html`, `dist/assets/...`), that
 * directory is stripped so the result always has `index.html` at its root
 * regardless of whether the archive was zipped from inside or outside the
 * build output directory.
 *
 * Decompression is budgeted using fflate's streaming `Unzip` API rather than
 * `unzipSync`, which fully decompresses everything up front with no limit —
 * a small, highly compressible zip ("zip bomb") could otherwise expand to
 * gigabytes and OOM the server. Here we (a) reject any entry whose declared
 * uncompressed size already exceeds the per-file cap before decompressing a
 * single byte of it, and (b) feed the compressed bytes to the decoder in
 * small chunks so decompressed output arrives incrementally via `ondata`,
 * letting us abort as soon as the running per-file/total size crosses budget
 * — without first materializing an unbounded buffer, even for archives with
 * missing/misleading size metadata.
 */
export function unzipBundle(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const chunksByPath = new Map<string, Uint8Array[]>();
    const sizeByPath = new Map<string, number>();
    let totalBytes = 0;
    let settled = false;

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    const unzipper = new Unzip((file: UnzipFile) => {
      if (settled) return;

      const zipPath = file.name;
      if (zipPath.endsWith("/") || isJunkPath(zipPath)) {
        // Directory entry or junk path — skip entirely, don't decompress it.
        return;
      }

      if (typeof file.originalSize === "number" && file.originalSize > MAX_BUNDLE_FILE_BYTES) {
        fail(new Error(BUNDLE_SIZE_ERROR));
        return;
      }

      file.ondata = (err, chunk) => {
        if (settled) return;
        if (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        if (!chunk) return;

        const prevSize = sizeByPath.get(zipPath) ?? 0;
        const nextSize = prevSize + chunk.length;
        totalBytes += chunk.length;

        if (nextSize > MAX_BUNDLE_FILE_BYTES || totalBytes > MAX_BUNDLE_TOTAL_BYTES) {
          fail(new Error(BUNDLE_SIZE_ERROR));
          return;
        }

        sizeByPath.set(zipPath, nextSize);
        const chunks = chunksByPath.get(zipPath);
        if (chunks) {
          chunks.push(chunk);
        } else {
          chunksByPath.set(zipPath, [chunk]);
        }
      };
      file.start();
    });
    unzipper.register(UnzipInflate);

    try {
      // Feed the archive in small chunks (rather than one `push(zip, true)`
      // call) so the decoder emits decompressed output incrementally and we
      // can bail out mid-archive instead of only after everything has been
      // expanded into memory.
      let offset = 0;
      do {
        if (settled) break;
        const end = Math.min(offset + FEED_CHUNK_BYTES, zip.length);
        const isFinal = end >= zip.length;
        unzipper.push(zip.subarray(offset, end), isFinal);
        offset = end;
      } while (offset < zip.length);
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (settled) return;

    const files: [string, Uint8Array][] = [];
    for (const [zipPath, chunks] of chunksByPath) {
      const size = sizeByPath.get(zipPath) ?? 0;
      const combined = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      files.push([zipPath, combined]);
    }

    const commonDir = findCommonTopLevelDir(files.map(([zipPath]) => zipPath));

    const result = new Map<string, Uint8Array>();
    for (const [zipPath, data] of files) {
      const relativePath = commonDir ? zipPath.slice(commonDir.length + 1) : zipPath;
      result.set(relativePath, data);
    }
    resolve(result);
  });
}

/**
 * If every path shares the same first segment, return that segment.
 * Otherwise return null (archive has files at multiple top-level locations,
 * so there's no single wrapping directory to strip).
 */
function findCommonTopLevelDir(paths: string[]): string | null {
  if (paths.length === 0) return null;

  let commonDir: string | null = null;
  for (const zipPath of paths) {
    const slashIndex = zipPath.indexOf("/");
    if (slashIndex === -1) return null; // a file lives at the archive root
    const topLevel = zipPath.slice(0, slashIndex);
    if (commonDir === null) {
      commonDir = topLevel;
    } else if (commonDir !== topLevel) {
      return null;
    }
  }
  return commonDir;
}
