/**
 * Pure validation for an "app" variation bundle (the unzipped output of a
 * built Vite `dist` directory), used by the upload endpoint before anything
 * is written to storage. Kept dependency-free (no Request/FormData/fetch) so
 * it's directly unit testable without a server.
 */

export const ALLOWED_BUNDLE_EXTENSIONS = [
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".wasm",
  ".map",
  ".txt",
];

/** Generous ceiling on file count per bundle — mainly a guard against pathological uploads. */
export const MAX_BUNDLE_FILE_COUNT = 500;

export type BundleValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate an unzipped bundle (relative-path -> bytes map, as produced by
 * `unzipBundle`) before it's stored: it must contain a root `index.html`
 * (the Vite entry), every file's extension must be on the allowlist, and the
 * file count must stay under `MAX_BUNDLE_FILE_COUNT`.
 */
export function validateBundleFiles(files: Map<string, Uint8Array>): BundleValidationResult {
  if (!files.has("index.html")) {
    return { ok: false, error: "Bundle is missing index.html at its root" };
  }
  if (files.size > MAX_BUNDLE_FILE_COUNT) {
    return { ok: false, error: `Bundle has too many files (max ${MAX_BUNDLE_FILE_COUNT})` };
  }
  for (const filePath of files.keys()) {
    if (!hasAllowedExtension(filePath)) {
      return { ok: false, error: `Disallowed file type: ${filePath}` };
    }
  }
  return { ok: true };
}

function hasAllowedExtension(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const extension = filePath.slice(dotIndex).toLowerCase();
  return ALLOWED_BUNDLE_EXTENSIONS.includes(extension);
}
