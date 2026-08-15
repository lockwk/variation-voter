import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { addVariation, setVariationSrc } from "@/db/queries";
import { voters, variations } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { unzipBundle } from "@/lib/storage/zip";
import { validateBundleFiles } from "@/lib/bundle-validation";

// Vercel Blob (the deployed storage driver) and typical Vite bundles are both
// comfortably under this; it's mainly a guard against pathological uploads.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const metadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;

  const [voter] = await db.select({ id: voters.id }).from(voters).where(eq(voters.id, voterId));
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const parsed = metadataSchema.safeParse({
    title: form.get("title") ?? undefined,
    description: form.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const bundle = form.get("bundle");
  if (!(bundle instanceof File)) {
    return NextResponse.json({ error: "Missing bundle file" }, { status: 400 });
  }
  if (bundle.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Bundle exceeds max upload size of ${MAX_UPLOAD_BYTES} bytes` },
      { status: 400 }
    );
  }

  let files: Map<string, Uint8Array>;
  try {
    const bytes = new Uint8Array(await bundle.arrayBuffer());
    files = await unzipBundle(bytes);
  } catch {
    return NextResponse.json({ error: "Could not read bundle zip" }, { status: 400 });
  }

  const validation = validateBundleFiles(files);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { title, description } = parsed.data;
  // Created with a "pending" placeholder src so the row (and its id) exists
  // before we know the final `/apps/<id>/index.html` path — addVariation
  // requires a non-empty src up front.
  const variation = await addVariation(db, voterId, { title, description, kind: "app", src: "pending" });

  // Best-effort cleanup for anything that failed after (or during) storing
  // the bundle: delete the (possibly partially-written) bundle and the DB
  // row, so we never leave an orphaned blob or a row stuck at "pending".
  // Wrapped so a cleanup failure doesn't mask the original error.
  async function cleanUp() {
    try {
      await getStorage().deleteBundle(variation.id);
    } catch (cleanupError) {
      console.error("Failed to clean up orphaned bundle", variation.id, cleanupError);
    }
    try {
      await db.delete(variations).where(eq(variations.id, variation.id));
    } catch (cleanupError) {
      console.error("Failed to clean up orphaned variation row", variation.id, cleanupError);
    }
  }

  try {
    await getStorage().putBundle(variation.id, files);
  } catch (storageError) {
    console.error("Failed to store app variation bundle", storageError);
    await cleanUp();
    return NextResponse.json({ error: "Failed to store bundle" }, { status: 500 });
  }

  let updated;
  try {
    updated = await setVariationSrc(db, variation.id, `/apps/${variation.id}/index.html`);
  } catch (error) {
    console.error("Failed to finalize app variation", error);
    await cleanUp();
    return NextResponse.json({ error: "Failed to store bundle" }, { status: 500 });
  }

  if (!updated) {
    console.error("setVariationSrc returned no row for variation", variation.id);
    await cleanUp();
    return NextResponse.json({ error: "Failed to store bundle" }, { status: 500 });
  }

  return NextResponse.json({ variation: updated }, { status: 201 });
}
