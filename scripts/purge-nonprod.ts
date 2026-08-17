#!/usr/bin/env tsx
// Vercel Cron only runs on production, so the automatic daily cleanup
// (`GET /api/cron/cleanup`) never runs for dev/preview. This script manually
// triggers the same cleanup against a non-prod environment: it hits
// GET /api/cron/cleanup with the CRON_SECRET bearer, which purges expired
// voters plus archived voters past the grace period (and their bundles).

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const base = (process.env.VARIATION_VOTER_URL ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("Missing CRON_SECRET env var — set it in .env.local or the environment.");
    process.exit(1);
    return;
  }

  const response = await fetch(`${base}/api/cron/cleanup`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Purge failed (${response.status}): ${body}`);
    process.exit(1);
    return;
  }

  const { deletedCount, deletedIds } = (await response.json()) as {
    deletedCount: number;
    deletedIds: string[];
  };

  console.log(`Purged ${deletedCount} voter(s) from ${base}`);
  if (deletedIds.length > 0) {
    for (const id of deletedIds) {
      console.log(`  - ${id}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
