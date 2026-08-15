/**
 * Pluggable storage for "app" variation bundles.
 *
 * A bundle is the static build output of a self-contained React app — an
 * `index.html` plus hashed `assets/*.js|css` and image/font files — stored
 * under a bundle id (which is a variation id). Files within a bundle are
 * addressed by their path relative to the bundle root, e.g. `"index.html"`,
 * `"assets/index-ABC123.js"`, `"assets/logo.png"`.
 *
 * Two drivers implement this interface: `local-fs.ts` (filesystem, used in
 * local dev / self-host) and `vercel-blob.ts` (Vercel Blob, used when
 * deployed on Vercel). Callers should obtain an instance via `getStorage()`
 * in `index.ts` rather than importing a driver directly, so the same code
 * works in both environments.
 */

export interface StoredFile {
  /** Raw bytes of the file. */
  data: Uint8Array;
  /** MIME type derived from the file extension. */
  contentType: string;
}

export interface BundleStorage {
  /**
   * Store a whole bundle: map of relative-path -> bytes.
   * Overwrites any existing bundle with this id.
   */
  putBundle(bundleId: string, files: Map<string, Uint8Array>): Promise<void>;

  /**
   * Fetch one file by its relative path within the bundle.
   * Returns null if not found. `filePath` may have a leading slash, which
   * must be normalized away before lookup.
   */
  getFile(bundleId: string, filePath: string): Promise<StoredFile | null>;

  /**
   * Delete an entire bundle and all its files.
   * Idempotent — does not error if the bundle is already absent.
   */
  deleteBundle(bundleId: string): Promise<void>;
}
