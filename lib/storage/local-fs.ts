import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { BundleStorage, StoredFile } from "./types";
import { contentTypeFor } from "./mime";

// Local bundle store lives at the repo root, gitignored (see .gitignore).
// This is the local-dev / self-host baseline driver — used whenever
// BLOB_READ_WRITE_TOKEN is not set (see index.ts).
const DEFAULT_BUNDLES_ROOT = path.join(process.cwd(), ".bundles");

/**
 * Reject a bundleId that isn't a single, plain path segment: no `..`, no
 * path separators (`/` or `\`), no NUL. bundleId is normally a fixed-shape
 * nanoid (see lib/ids.ts), but storage shouldn't trust that — it's the last
 * line of defense against a bundleId being used to escape `bundlesRoot`.
 */
function isSafeBundleId(bundleId: string): boolean {
  return bundleId.length > 0 && !/[\\/]|\.\.|\0/.test(bundleId);
}

/**
 * Resolve a bundle-relative file path to an absolute path on disk, guarding
 * against path traversal: the bundleId is checked to be a single safe path
 * segment, a leading slash on filePath is stripped, `..` segments are
 * rejected outright, and the final resolved path is double-checked to still
 * live under the bundle's directory before it's returned.
 *
 * Returns null if the bundleId is unsafe or the path escapes the bundle
 * directory.
 */
function resolveSafePath(bundlesRoot: string, bundleId: string, filePath: string): string | null {
  if (!isSafeBundleId(bundleId)) {
    return null;
  }

  const stripped = filePath.replace(/^\/+/, "");
  const normalized = path.normalize(stripped);

  if (normalized.split(path.sep).includes("..") || path.isAbsolute(normalized)) {
    return null;
  }

  const bundlesRootResolved = path.resolve(bundlesRoot);
  const dir = path.join(bundlesRoot, bundleId);
  const resolved = path.resolve(dir, normalized);
  const resolvedDir = path.resolve(dir);

  if (
    resolvedDir !== bundlesRootResolved &&
    !resolvedDir.startsWith(bundlesRootResolved + path.sep)
  ) {
    return null;
  }

  if (resolved !== resolvedDir && !resolved.startsWith(resolvedDir + path.sep)) {
    return null;
  }

  return resolved;
}

export class LocalFsBundleStorage implements BundleStorage {
  private readonly bundlesRoot: string;

  /**
   * @param bundlesRoot Directory under which bundles are stored, one
   * subdirectory per bundle id. Defaults to `.bundles/` at the repo root
   * (`process.cwd()`). Tests pass a temp directory here instead of touching
   * the real local bundle store.
   */
  constructor(bundlesRoot: string = DEFAULT_BUNDLES_ROOT) {
    this.bundlesRoot = bundlesRoot;
  }

  private bundleDir(bundleId: string): string {
    return path.join(this.bundlesRoot, bundleId);
  }

  async putBundle(bundleId: string, files: Map<string, Uint8Array>): Promise<void> {
    if (!isSafeBundleId(bundleId)) {
      throw new Error(`Refusing to write bundle with unsafe id: ${bundleId}`);
    }

    const dir = this.bundleDir(bundleId);
    // Start from a clean slate so a re-upload can't leave stale files behind.
    await rm(dir, { recursive: true, force: true });

    for (const [relativePath, data] of files) {
      const absolutePath = resolveSafePath(this.bundlesRoot, bundleId, relativePath);
      if (!absolutePath) {
        throw new Error(`Refusing to write outside bundle directory: ${relativePath}`);
      }
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, data);
    }
  }

  async getFile(bundleId: string, filePath: string): Promise<StoredFile | null> {
    const absolutePath = resolveSafePath(this.bundlesRoot, bundleId, filePath);
    if (!absolutePath) return null;

    try {
      const data = await readFile(absolutePath);
      return { data: new Uint8Array(data), contentType: contentTypeFor(absolutePath) };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async deleteBundle(bundleId: string): Promise<void> {
    if (!isSafeBundleId(bundleId)) return;
    await rm(this.bundleDir(bundleId), { recursive: true, force: true });
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
