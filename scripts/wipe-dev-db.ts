#!/usr/bin/env tsx
// Wipes all voter/variation/vote rows from the database DATABASE_URL points at.
//
// Run automatically by Conductor's `scripts.archive` hook when this workspace
// is archived, so every workspace's manual test data gets cleared out rather
// than accumulating across workspaces indefinitely.
//
// DO NOT point .env.local's DATABASE_URL at a shared/production database —
// this script has no confirmation prompt and will delete everything in it.

import { config } from "dotenv";
config({ path: ".env.local" });

// Static imports hoist above the config() call above, so db/client (which reads
// DATABASE_URL at import time) must be loaded dynamically, after .env.local is loaded.
async function main() {
  const { db } = await import("../db/client");
  const { voters, variations, votes } = await import("../db/schema");
  await db.delete(votes);
  await db.delete(variations);
  await db.delete(voters);
  console.log("Dev database wiped.");
}

main();
