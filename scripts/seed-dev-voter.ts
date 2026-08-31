#!/usr/bin/env tsx
// Seeds a demo voter with variations, votes, and comments in the database
// DATABASE_URL points at, so there's real content to look at as soon as the
// dev server starts. Idempotent — skips if the seed voter already exists,
// so restarting the dev server never creates duplicates.
//
// Run automatically before `npm run dev` by Conductor's `scripts.run.dev`
// hook (see .conductor/settings.toml).

import { config } from "dotenv";
config({ path: ".env.local" });

export const SEED_TITLE = "Dark mode preview (seed)";

// Type of the dynamically-imported db/client module's `db` export. Declared
// here (rather than statically imported) because db/client reads
// DATABASE_URL at import time, and that import must stay dynamic — see below.
type Db = (typeof import("../db/client"))["db"];

/**
 * Find the demo seed voter, creating (and populating) it if it doesn't exist
 * yet. Extracted from `main()` so other dev scripts (e.g.
 * scripts/seed-app-into-demo.ts) can locate/create the same demo voter
 * without duplicating this lookup-or-create logic. Never mutates an
 * already-existing seed voter's variations.
 *
 * Returns the voter plus whether it already existed, so callers can log
 * accordingly without a second lookup.
 */
export async function ensureSeedVoter(db: Db) {
  const { createVoter, addVariation, castVote, createComment, listVoters } = await import(
    "../db/queries"
  );

  const existing = (await listVoters(db)).find((voter) => voter.title === SEED_TITLE);
  if (existing) {
    return { voter: existing, alreadyExisted: true };
  }

  const voter = await createVoter(db, { title: SEED_TITLE });

  const embed = await addVariation(db, voter.id, {
    title: "Embedded HTML",
    kind: "embed",
    // `id="vv-seed-target"` gives the seeded comment below a stable element
    // to pin to — annotation-layer.tsx resolves an "element"-anchored embed
    // comment via `embedContainer.querySelector(selector)`, and an `#id`
    // selector (the same format computeSelector produces for a unique id)
    // resolves correctly there.
    src: '<div style="padding:48px;font-family:sans-serif;text-align:center"><h1 id="vv-seed-target">Variation A</h1><p>Inline embed content.</p></div>',
  });
  const image = await addVariation(db, voter.id, {
    title: "Placeholder image",
    kind: "image",
    src: "https://placehold.co/800x450/09090b/e4e4e7?text=Variation+B",
  });

  // Votes stay (demo vote counts) but no longer gate whether a comment
  // renders — every seeded comment is a real pin (KEV-172), not a
  // vote-anchored note.
  await castVote(db, embed.id, { direction: "up", viewerId: "seed-viewer-1" });
  await createComment(db, {
    variationId: embed.id,
    viewerId: "seed-viewer-1",
    comment: "Love the darker nav, much easier on the eyes.",
    voterName: "Kevin",
    anchorType: "element",
    selector: "#vv-seed-target",
    offsetX: 0.5,
    offsetY: 0.5,
  });

  await castVote(db, image.id, { direction: "down", viewerId: "seed-viewer-2" });
  await createComment(db, {
    variationId: image.id,
    viewerId: "seed-viewer-2",
    comment: "Not a fan of this one.",
    anchorType: "point",
    offsetX: 0.4,
    offsetY: 0.35,
  });

  return { voter, alreadyExisted: false };
}

// Static imports hoist above the config() call above, so db/client (which reads
// DATABASE_URL at import time) must be loaded dynamically, after .env.local is loaded.
async function main() {
  const { db } = await import("../db/client");

  const port = process.env.CONDUCTOR_PORT ?? "3000";
  const { voter, alreadyExisted } = await ensureSeedVoter(db);

  console.log(
    `${alreadyExisted ? "Seed voter already exists" : "Seeded demo voter"}: http://localhost:${port}/v/${voter.id}`
  );
}

main().catch((error) => {
  // Seeding is a dev convenience — never let a failure (DB unreachable,
  // migrations not yet applied, transient error) block `npm run dev`.
  console.warn("Skipping dev seed:", error instanceof Error ? error.message : error);
});
