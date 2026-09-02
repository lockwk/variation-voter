#!/usr/bin/env tsx
// Wipes all voter/variation/vote rows from the database the guard resolves.
//
// Run automatically by Conductor's `scripts.archive` hook when this workspace
// is archived, so every workspace's manual test data gets cleared out rather
// than accumulating across workspaces indefinitely.
//
// This hook is best-effort and non-interactive (it can't prompt), so it does
// NOT delete against a remote database unless DB_TARGET_CONFIRM_HOST is
// already set to match — see lib/db-target.ts (KEV-186). Every workspace's
// .env.local points at the same shared dev database by default, so in
// practice this will usually skip with a warning rather than wipe; that's
// intentional until per-workspace dev DB isolation (KEV-187) lands.

import { config } from "dotenv";
// override: true so .env.local wins over a stray already-exported var (e.g. a
// leaked test DATABASE_URL) — see KEV-186.
config({ path: ".env.local", override: true });

import { resolveDbTarget, checkDbTargetGuard } from "../lib/db-target";

// Static imports hoist above the config() call above, so db/client (which reads
// DATABASE_URL at import time) must be loaded dynamically, after .env.local is loaded.
async function main() {
  const target = resolveDbTarget();
  console.log(`wipe-dev-db target -> host: ${target.host}, database: ${target.database}`);

  const result = checkDbTargetGuard(target);
  if (!result.allowed) {
    console.warn(
      `\nSkipping wipe: ${target.host} is a remote database and DB_TARGET_CONFIRM_HOST is not set to match.\n` +
        `No rows were deleted. To wipe intentionally, run:\n\n` +
        `  DB_TARGET_CONFIRM_HOST=${target.host} npx tsx scripts/wipe-dev-db.ts\n`,
    );
    process.exit(0);
  }

  const { db } = await import("../db/client");
  const { voters, variations, votes } = await import("../db/schema");
  await db.delete(votes);
  await db.delete(variations);
  await db.delete(voters);
  console.log("Dev database wiped.");
}

main();
