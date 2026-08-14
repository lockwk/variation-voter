#!/usr/bin/env tsx
// Seeds a demo voter with a single "url" variation pointing at the built
// pick-duel Vite app served from public/variations/pick-duel/. Proves the
// voter shell can render a self-contained, interactive React build via the
// existing kind: "url" iframe — no schema/stage.tsx changes required.
//
// Idempotent — skips if a voter with SEED_TITLE already exists.

import { config } from "dotenv";
config({ path: ".env.local" });

const SEED_TITLE = "App variation demo (seed)";

// Static imports hoist above the config() call above, so db/client (which reads
// DATABASE_URL at import time) must be loaded dynamically, after .env.local is loaded.
async function main() {
  const { db } = await import("../db/client");
  const { createVoter, addVariation, listVoters } = await import("../db/queries");

  const port = process.env.CONDUCTOR_PORT ?? "3000";
  const existing = (await listVoters(db)).find((voter) => voter.title === SEED_TITLE);
  if (existing) {
    console.log(`Seed voter already exists: http://localhost:${port}/v/${existing.id}`);
    return;
  }

  const voter = await createVoter(db, { title: SEED_TITLE });

  await addVariation(db, voter.id, {
    title: "Pick your vibe (built React app)",
    kind: "url",
    src: "/variations/pick-duel/index.html",
  });

  console.log(`Seeded app-variation voter: http://localhost:${port}/v/${voter.id}`);
}

main().catch((error) => {
  // Seeding is a dev convenience — never let a failure (DB unreachable,
  // migrations not yet applied, transient error) block downstream tooling.
  console.warn("Skipping app-variation seed:", error instanceof Error ? error.message : error);
});
