import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/apps/[variationId]/[[...path]]/route";
import { getStorage } from "@/lib/storage";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Must be a valid nanoid-shaped id (see lib/ids.ts): 10 lowercase-alphanumeric chars.
const VALID_ID = "abc123defg";

function appRequest(variationId: string, path?: string[]) {
  const suffix = path && path.length ? `/${path.join("/")}` : "";
  const req = new Request(`http://localhost/apps/${variationId}${suffix}`);
  return GET(req, { params: Promise.resolve({ variationId, path }) });
}

const storedBundleIds: string[] = [];

afterEach(async () => {
  const storage = getStorage();
  await Promise.all(storedBundleIds.splice(0).map((id) => storage.deleteBundle(id)));
});

describe("GET /apps/:variationId/*", () => {
  it("serves index.html by default from a stored bundle", async () => {
    storedBundleIds.push(VALID_ID);
    await getStorage().putBundle(
      VALID_ID,
      new Map([
        ["index.html", encode("<html>app</html>")],
        ["assets/index-ABC.js", encode("console.log(1)")],
      ])
    );

    const response = await appRequest(VALID_ID);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>app</html>");
  });

  it("404s for a missing file in an existing bundle", async () => {
    storedBundleIds.push(VALID_ID);
    await getStorage().putBundle(VALID_ID, new Map([["index.html", encode("<html></html>")]]));

    const response = await appRequest(VALID_ID, ["nope.html"]);
    expect(response.status).toBe(404);
  });

  it("404s for a missing bundle", async () => {
    const response = await appRequest(VALID_ID);
    expect(response.status).toBe(404);
  });

  it("404s an invalid variationId (wrong length) without hitting storage", async () => {
    const response = await appRequest("short");
    expect(response.status).toBe(404);
  });

  it("404s an invalid variationId (bad charset) without hitting storage", async () => {
    const response = await appRequest("ABC123DEFG");
    expect(response.status).toBe(404);
  });

  it("404s a variationId containing '..' without hitting storage", async () => {
    const response = await appRequest("../../etc");
    expect(response.status).toBe(404);
  });

  // Bundles are served same-origin without a CSP sandbox header: forcing an
  // opaque origin reliably breaks the bundle's ES module from loading in the
  // iframe. Isolation hardening (dedicated origin) is tracked in KEV-79.
  it("does not set a Content-Security-Policy sandbox header", async () => {
    storedBundleIds.push(VALID_ID);
    await getStorage().putBundle(VALID_ID, new Map([["index.html", encode("<html></html>")]]));

    const response = await appRequest(VALID_ID);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("caches hashed assets as immutable but not index.html or root files", async () => {
    storedBundleIds.push(VALID_ID);
    await getStorage().putBundle(
      VALID_ID,
      new Map([
        ["index.html", encode("<html></html>")],
        ["favicon.ico", encode("icon")],
        ["assets/index-ABC.js", encode("console.log(1)")],
      ])
    );

    const asset = await appRequest(VALID_ID, ["assets", "index-ABC.js"]);
    expect(asset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const index = await appRequest(VALID_ID);
    expect(index.headers.get("Cache-Control")).toBe("no-cache");

    const favicon = await appRequest(VALID_ID, ["favicon.ico"]);
    expect(favicon.headers.get("Cache-Control")).toBe("no-cache");
  });
});
