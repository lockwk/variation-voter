#!/usr/bin/env tsx
// Setup-time hook (see .conductor/settings.toml `scripts.setup`) that
// provisions per-workspace Neon dev/test database branches — DORMANT unless
// a Neon API key is configured (see lib/neon-branches.ts for the full env
// var list and rationale). With no NEON_API_KEY/NEON_PROJECT_ID configured,
// this is a one-line no-op and the workspace keeps using today's exact
// shared dev (`damp-sky`) / test (`rapid-glade`) databases (KEV-187).
//
// When configured, this:
//   1. creates or reuses a `cw/<workspace>-dev` and `cw/<workspace>-test`
//      Neon branch (idempotent — safe to re-run if setup runs more than once)
//   2. rewrites this workspace's .env.local / .env.test.local to point at
//      those branches, preserving every other line (see lib/env-file.ts)
//   3. runs the existing guarded migration wrapper against each branch,
//      passing DB_TARGET_CONFIRM_HOST so the KEV-186 guard permits it

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isConfigured, createOrReuseBranch } from "../lib/neon-branches";
import { parseDbTarget } from "../lib/db-target";
import { writeEnvUpdates } from "../lib/env-file";

function workspaceName(): string {
  return process.env.CONDUCTOR_WORKSPACE_NAME ?? path.basename(process.cwd());
}

function runGuardedMigrate(envFile: string, confirmHost: string): void {
  const result = spawnSync("npx", ["tsx", "scripts/guarded-migrate.ts", envFile], {
    stdio: "inherit",
    env: { ...process.env, DB_TARGET_CONFIRM_HOST: confirmHost },
  });
  if (result.status !== 0) {
    throw new Error(
      `provision-workspace-db: migration failed for ${envFile} (exit code ${result.status ?? "unknown"})`,
    );
  }
}

export async function provisionWorkspaceDb(): Promise<void> {
  if (!isConfigured()) {
    console.log(
      "provision-workspace-db: Neon not configured (NEON_API_KEY/NEON_PROJECT_ID unset, or not a local Conductor workspace) — skipping. Using today's shared dev/test databases.",
    );
    return;
  }

  const workspace = workspaceName();
  console.log(`provision-workspace-db: provisioning Neon branches for workspace "${workspace}"`);

  const dev = await createOrReuseBranch({ workspace, kind: "dev" });
  const test = await createOrReuseBranch({ workspace, kind: "test" });

  writeEnvUpdates(path.resolve(".env.local"), {
    DATABASE_URL: dev.pooledUri,
    DATABASE_URL_UNPOOLED: dev.unpooledUri,
  });
  // .env.test.local only ever defines a single DATABASE_URL (see
  // .env.test.local.example) — matching that, not adding an unpooled var here.
  writeEnvUpdates(path.resolve(".env.test.local"), {
    DATABASE_URL: test.pooledUri,
  });

  runGuardedMigrate(".env.local", parseDbTarget(dev.unpooledUri).host);
  runGuardedMigrate(".env.test.local", parseDbTarget(test.pooledUri).host);

  console.log(`provision-workspace-db: done (dev branch=${dev.branchId}, test branch=${test.branchId}).`);
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  provisionWorkspaceDb().catch((error) => {
    console.error("provision-workspace-db failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
