#!/usr/bin/env tsx
// One-off dev helper: adds extra variations to an existing voter so the rail
// layout's "many variations" (list caps at 50%, scrolls) regime can be
// verified against real seeded data. Not wired into any npm script — run
// directly with `env -u DATABASE_URL npx tsx scripts/seed-extra-variations.ts`.
import { config } from "dotenv";
config({ path: ".env.local" });

const VOTER_ID = "mi2ubq4wp2";
const TITLES = ["Warm palette", "Condensed layout", "Serif headline", "High-contrast CTA", "Two-column stage"];

async function main() {
  const { db } = await import("../db/client");
  const { addVariation } = await import("../db/queries");

  for (const title of TITLES) {
    const variation = await addVariation(db, VOTER_ID, {
      title,
      kind: "embed",
      src: `<div style="padding:48px;font-family:sans-serif;text-align:center"><h1>${title}</h1></div>`,
    });
    console.log(`Added ${variation.id} (${title})`);
  }
}

main().catch((error) => {
  console.error("Failed to seed extra variations:", error);
  process.exit(1);
});
