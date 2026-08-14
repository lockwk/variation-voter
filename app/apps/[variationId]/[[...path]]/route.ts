import { getStorage } from "@/lib/storage";

// Must match the id shape produced by lib/ids.ts (customAlphabet, fixed length).
const VARIATION_ID_PATTERN = /^[0-9a-z]{10}$/;

/**
 * Serves files from an "app" variation's static bundle at
 * `/apps/<variationId>/<relativePath>`. With no trailing path segments this
 * serves `index.html` — the entry point referenced by a variation's `src`.
 *
 * ISOLATION: bundles are served from THIS origin and framed with
 * `allow-scripts allow-same-origin` (same posture as `url` variations). A CSP
 * `sandbox` header would give stronger opaque-origin isolation, but forcing an
 * opaque origin reliably prevents the bundle's `crossorigin` ES module from
 * loading in the iframe (blank render). App bundles are admin/agent-built
 * (trusted), so this is acceptable for now; the real hardening is serving
 * bundles from a dedicated origin — tracked in KEV-79.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ variationId: string; path?: string[] }> },
) {
  const { variationId, path } = await params;

  if (!VARIATION_ID_PATTERN.test(variationId)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path && path.length ? path.join("/") : "index.html";

  const file = await getStorage().getFile(variationId, filePath);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.contentType,
      // Permissive resource headers so a future move to a dedicated bundle
      // origin (KEV-79) works without changes; harmless while same-origin.
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      // Only hashed assets (content-addressed, immutable filenames) get a
      // long-lived cache; everything else (index.html, unhashed root files
      // like favicon.ico/manifest.json) revalidates instead.
      "Cache-Control": filePath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    },
  });
}
