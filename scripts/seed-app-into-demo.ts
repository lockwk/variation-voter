#!/usr/bin/env tsx
// Dev-only helper for manually testing pinned comments (KEV-172) against a
// real `kind: "app"` variation — the same-origin iframe case that supports
// hover-any-element highlighting. seed-dev-voter.ts's demo voter only has
// embed/image/url variations, none of which are the app case. This script
// adds one built app bundle as a variation on that same demo voter, mirroring
// the real upload path (app/api/admin/voters/[voterId]/apps/route.ts):
// create the variation with a "pending" src, store the bundle via
// getStorage(), then point src at /apps/<id>/index.html.
//
// Idempotent — if the demo voter already has a `kind: "app"` variation, this
// skips without adding a duplicate. Never touches the demo voter's other
// (embed/image/url) variations.
//
// Run manually: npx tsx scripts/seed-app-into-demo.ts

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });

// pick-duel has visually distinct, clickable elements (cards/buttons), which
// makes hover-highlighting easy to see while testing pin placement.
const PICK_DUEL_DIR = path.join(process.cwd(), "variation-apps", "pick-duel");
// Vite for this app is configured (see variation-apps/pick-duel/vite.config.ts)
// to build straight into public/variations/pick-duel/ rather than a local
// dist/ — reuse that pre-built output if present instead of rebuilding.
const PICK_DUEL_PREBUILT_DIR = path.join(process.cwd(), "public", "variations", "pick-duel");
const PICK_DUEL_DIST_DIR = path.join(PICK_DUEL_DIR, "dist");

const APP_VARIATION_TITLE = "Pick your vibe (built app, for pinned-comment testing)";

// Static imports hoist above the config() call above, so db/client (which
// reads DATABASE_URL at import time) must be loaded dynamically, after
// .env.local is loaded.
async function main() {
  const { db } = await import("../db/client");
  const { ensureSeedVoter } = await import("./seed-dev-voter");
  const { addVariation, setVariationSrc } = await import("../db/queries");
  const { variations } = await import("../db/schema");
  const { getStorage } = await import("../lib/storage");
  const { and, eq } = await import("drizzle-orm");

  const port = process.env.CONDUCTOR_PORT ?? "3000";
  const { voter } = await ensureSeedVoter(db);

  const existingApp = await db
    .select({ id: variations.id })
    .from(variations)
    .where(and(eq(variations.voterId, voter.id), eq(variations.kind, "app")))
    .limit(1);
  if (existingApp.length > 0) {
    console.log(
      `Demo voter already has an app variation (${existingApp[0].id}): http://localhost:${port}/v/${voter.id}`
    );
    return;
  }

  const bundleDir = await resolveBundleDir();
  const files = await readBundleDir(bundleDir);
  if (!files.has("index.html")) {
    throw new Error(`Bundle at ${bundleDir} has no index.html — refusing to seed a broken app variation`);
  }

  // Created with a "pending" placeholder src, matching the real upload
  // endpoint — addVariation requires a non-empty src before the final
  // /apps/<id>/index.html path is known.
  const variation = await addVariation(db, voter.id, {
    title: APP_VARIATION_TITLE,
    kind: "app",
    src: "pending",
  });

  await getStorage().putBundle(variation.id, files);
  const updated = await setVariationSrc(db, variation.id, `/apps/${variation.id}/index.html`);
  if (!updated) {
    throw new Error(`setVariationSrc returned no row for variation ${variation.id}`);
  }

  console.log(`Stored app bundle for variation ${variation.id} (${files.size} files) from ${bundleDir}`);
  console.log(`Seeded app variation into demo voter: http://localhost:${port}/v/${voter.id}`);
}

/**
 * Prefer an already-built pick-duel bundle (public/variations/pick-duel/,
 * where its Vite config outputs by default, or variation-apps/pick-duel/dist
 * if it's ever built with a plain `vite build`). Falls back to building it
 * with `npm install && npm run build` if neither exists.
 */
async function resolveBundleDir(): Promise<string> {
  if (existsSync(path.join(PICK_DUEL_PREBUILT_DIR, "index.html"))) {
    return PICK_DUEL_PREBUILT_DIR;
  }
  if (existsSync(path.join(PICK_DUEL_DIST_DIR, "index.html"))) {
    return PICK_DUEL_DIST_DIR;
  }

  console.log("No pre-built pick-duel bundle found — building it now...");
  const { execSync } = await import("node:child_process");
  execSync("npm install", { cwd: PICK_DUEL_DIR, stdio: "inherit" });
  execSync("npm run build", { cwd: PICK_DUEL_DIR, stdio: "inherit" });

  if (existsSync(path.join(PICK_DUEL_PREBUILT_DIR, "index.html"))) {
    return PICK_DUEL_PREBUILT_DIR;
  }
  if (existsSync(path.join(PICK_DUEL_DIST_DIR, "index.html"))) {
    return PICK_DUEL_DIST_DIR;
  }
  throw new Error(`Built pick-duel but found no index.html in ${PICK_DUEL_PREBUILT_DIR} or ${PICK_DUEL_DIST_DIR}`);
}

/** Recursively read every file under `dir` into a bundle-relative Map, keyed by posix-style relative path. */
async function readBundleDir(dir: string): Promise<Map<string, Uint8Array>> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Node <22 lacks Dirent.parentPath; fall back to the deprecated .path.
    const parentPath = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path;
    const absolutePath = path.join(parentPath, entry.name);
    const relativePath = path.relative(dir, absolutePath).split(path.sep).join("/");
    files.set(relativePath, new Uint8Array(await readFile(absolutePath)));
  }
  return files;
}

main().catch((error) => {
  console.error("Failed to seed app variation into demo voter:", error instanceof Error ? error.message : error);
  process.exit(1);
});
