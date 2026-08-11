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

const SEED_TITLE = "Dark mode preview (seed)";

// Static imports hoist above the config() call above, so db/client (which reads
// DATABASE_URL at import time) must be loaded dynamically, after .env.local is loaded.
async function main() {
  const { db } = await import("../db/client");
  const { createVoter, addVariation, castVote, attachCommentToVote, listVoters } = await import(
    "../db/queries"
  );

  const port = process.env.CONDUCTOR_PORT ?? "3000";
  const existing = (await listVoters(db)).find((voter) => voter.title === SEED_TITLE);
  if (existing) {
    console.log(`Seed voter already exists: http://localhost:${port}/v/${existing.id}`);
    return;
  }

  const voter = await createVoter(db, { title: SEED_TITLE });

  const embed = await addVariation(db, voter.id, {
    title: "Embedded HTML",
    kind: "embed",
    src: '<div style="padding:48px;font-family:sans-serif;text-align:center"><h1>Variation A</h1><p>Inline embed content.</p></div>',
  });
  const image = await addVariation(db, voter.id, {
    title: "Placeholder image",
    kind: "image",
    src: "https://placehold.co/800x450/09090b/e4e4e7?text=Variation+B",
  });
  await addVariation(db, voter.id, {
    title: "Live page",
    kind: "url",
    src: "https://example.com",
  });

  const upvote = await castVote(db, embed.id, { direction: "up" });
  await attachCommentToVote(db, upvote.id, embed.id, {
    comment: "Love the darker nav, much easier on the eyes.",
    voterName: "Kevin",
  });

  const downvote = await castVote(db, image.id, { direction: "down" });
  await attachCommentToVote(db, downvote.id, image.id, {
    comment: "Not a fan of this one.",
  });

  console.log(`Seeded demo voter: http://localhost:${port}/v/${voter.id}`);
}

main().catch((error) => {
  // Seeding is a dev convenience — never let a failure (DB unreachable,
  // migrations not yet applied, transient error) block `npm run dev`.
  console.warn("Skipping dev seed:", error instanceof Error ? error.message : error);
});
