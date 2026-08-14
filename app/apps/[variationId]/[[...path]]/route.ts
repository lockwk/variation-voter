import { getStorage } from "@/lib/storage";

// Must match the id shape produced by lib/ids.ts (customAlphabet, fixed length).
const VARIATION_ID_PATTERN = /^[0-9a-z]{10}$/;

/**
 * Serves files from an "app" variation's static bundle at
 * `/apps/<variationId>/<relativePath>`. With no trailing path segments this
 * serves `index.html` — the entry point referenced by a variation's `src`.
 *
 * Every served response carries `Content-Security-Policy: sandbox
 * allow-scripts;`, which forces the document into a unique opaque origin
 * whether it's framed or navigated to directly. That neutralizes same-origin
 * escape and stored-XSS against this app's origin (cookies, DOM, `/api`)
 * regardless of how the bundle is loaded.
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
      // Forces this response into a unique opaque origin (see doc comment
      // above) — the primary defense against same-origin escape/stored-XSS.
      "Content-Security-Policy": "sandbox allow-scripts;",
      // Needed so the bundle's `crossorigin` module scripts still load
      // correctly under the opaque origin the CSP above puts it in.
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
