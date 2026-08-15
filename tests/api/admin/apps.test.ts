import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/admin/voters/[voterId]/apps/route";
import { db } from "@/db/client";
import { createVoter, setVariationSrc } from "@/db/queries";
import { variations } from "@/db/schema";
import { getStorage } from "@/lib/storage";

vi.mock("@/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries")>();
  return { ...actual, setVariationSrc: vi.fn(actual.setVariationSrc) };
});

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
});

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bundleZip(entries: Record<string, Uint8Array> = { "index.html": encode("<html>app</html>") }) {
  return zipSync(entries);
}

function appRequest(voterId: string, form: FormData, headers: Record<string, string> = { authorization: "Bearer secret123" }) {
  return new Request(`http://localhost/api/admin/voters/${voterId}/apps`, {
    method: "POST",
    headers,
    body: form,
  });
}

function formWith(fields: { title?: string; description?: string; bundle?: Uint8Array | null }) {
  const form = new FormData();
  if (fields.title !== undefined) form.set("title", fields.title);
  if (fields.description !== undefined) form.set("description", fields.description);
  if (fields.bundle !== undefined && fields.bundle !== null) {
    form.set("bundle", new Blob([fields.bundle as BlobPart], { type: "application/zip" }), "bundle.zip");
  }
  return form;
}

const storedBundleIds: string[] = [];

// `getStorage()` returns a memoized singleton, so `vi.spyOn` calls across
// tests mutate the same instance. Track spies created via `spyOnStorage` and
// restore them after each test so a later test's spy doesn't wrap (and
// double-count calls through) an earlier test's leftover spy. Note: this
// must NOT be `vi.restoreAllMocks()` — that would also reset the
// `setVariationSrc` mock declared above (a plain `vi.fn`, not a `vi.spyOn`)
// to a no-op, breaking every other test's happy path.
const storageSpies: { mockRestore: () => void }[] = [];
function spyOnStorage<M extends keyof ReturnType<typeof getStorage>>(method: M) {
  const spy = vi.spyOn(getStorage(), method);
  storageSpies.push(spy);
  return spy;
}

afterEach(async () => {
  const storage = getStorage();
  await Promise.all(storedBundleIds.splice(0).map((id) => storage.deleteBundle(id)));
  storageSpies.splice(0).forEach((spy) => spy.mockRestore());
});

describe("POST /api/admin/voters/:voterId/apps", () => {
  it("rejects an unauthorized request", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({ title: "A", bundle: bundleZip() });
    const response = await POST(appRequest(voter.id, form, {}), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(401);
  });

  it("404s when the voter doesn't exist", async () => {
    const form = formWith({ title: "A", bundle: bundleZip() });
    const response = await POST(appRequest("does-not-exist", form), {
      params: Promise.resolve({ voterId: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a request with no bundle file", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({ title: "A" });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(400);
  });

  it("rejects a bundle missing index.html", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({ title: "A", bundle: bundleZip({ "assets/app.js": encode("x") }) });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(400);
  });

  it("rejects a bundle with a disallowed file extension", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({
      title: "A",
      bundle: bundleZip({ "index.html": encode("<html></html>"), "server.php": encode("<?php ?>") }),
    });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(400);
  });

  it("rejects a missing/empty title", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({ title: "", bundle: bundleZip() });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(400);
  });

  it("stores the bundle and creates an app variation pointing at /apps/<id>/index.html", async () => {
    const voter = await createVoter(db, { title: "x" });
    const form = formWith({
      title: "My App",
      description: "a cool app",
      bundle: bundleZip({
        "index.html": encode("<html>app</html>"),
        "assets/index-ABC.js": encode("console.log(1)"),
      }),
    });

    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });
    expect(response.status).toBe(201);

    const body = await response.json();
    storedBundleIds.push(body.variation.id);

    expect(body.variation.kind).toBe("app");
    expect(body.variation.title).toBe("My App");
    expect(body.variation.src).toBe(`/apps/${body.variation.id}/index.html`);

    const stored = await getStorage().getFile(body.variation.id, "index.html");
    expect(stored).not.toBeNull();
    expect(new TextDecoder().decode(stored!.data)).toBe("<html>app</html>");
  });

  it("cleans up the bundle and the row when putBundle fails, and returns 500 (not 201)", async () => {
    const voter = await createVoter(db, { title: "x" });
    const putBundle = spyOnStorage("putBundle").mockRejectedValueOnce(new Error("storage is down"));
    const deleteBundle = spyOnStorage("deleteBundle");

    const form = formWith({ title: "A", bundle: bundleZip() });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.variation).toBeUndefined();

    expect(putBundle).toHaveBeenCalledTimes(1);
    const [failedVariationId] = putBundle.mock.calls[0];
    expect(deleteBundle).toHaveBeenCalledWith(failedVariationId);

    const rows = await db.select().from(variations).where(eq(variations.id, failedVariationId as string));
    expect(rows).toHaveLength(0);
  });

  it("cleans up the bundle and the row when setVariationSrc resolves null, and returns 500 (not 201 with a null variation)", async () => {
    const voter = await createVoter(db, { title: "x" });
    const deleteBundle = spyOnStorage("deleteBundle");
    vi.mocked(setVariationSrc).mockResolvedValueOnce(null);

    const form = formWith({ title: "A", bundle: bundleZip() });
    const response = await POST(appRequest(voter.id, form), { params: Promise.resolve({ voterId: voter.id }) });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.variation).toBeUndefined();

    expect(deleteBundle).toHaveBeenCalledTimes(1);
    const [orphanedVariationId] = deleteBundle.mock.calls[0];

    const rows = await db.select().from(variations).where(eq(variations.id, orphanedVariationId as string));
    expect(rows).toHaveLength(0);

    // The bundle itself should be gone too, not just the row.
    const stored = await getStorage().getFile(orphanedVariationId as string, "index.html");
    expect(stored).toBeNull();
  });
});
