import { config } from "dotenv";
// override: true so the env file wins over a stray already-exported var (e.g.
// a leaked test DATABASE_URL) — see KEV-186. No-op on Vercel, where there is
// no .env.local and injected env vars are what should win.
//
// DRIZZLE_ENV_FILE lets scripts/guarded-migrate.ts (spawned as a child
// process that re-requires this file) point drizzle-kit at a non-default env
// file — e.g. db:migrate:test targets .env.test.local — without this config
// silently reloading .env.local over it. Defaults to ".env.local" so a bare
// `drizzle-kit migrate` (as run by the Vercel build) is unaffected.
config({ path: process.env.DRIZZLE_ENV_FILE ?? ".env.local", override: true });

import { defineConfig } from "drizzle-kit";
import { resolveDbTargetUrl } from "./lib/db-target";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDbTargetUrl(),
  },
});
