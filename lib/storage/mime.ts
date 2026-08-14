/**
 * Extension -> MIME type map used to set Content-Type for served bundle
 * files. Falls back to `application/octet-stream` for unknown extensions.
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Derive a Content-Type from a file's extension. Case-insensitive. */
export function contentTypeFor(filePath: string): string {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return DEFAULT_CONTENT_TYPE;
  const ext = filePath.slice(dotIndex).toLowerCase();
  return MIME_TYPES[ext] ?? DEFAULT_CONTENT_TYPE;
}
