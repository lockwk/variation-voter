#!/usr/bin/env tsx
// Archive-time hook (see .conductor/settings.toml `scripts.archive`) that
// deletes this workspace's per-workspace Neon dev/test branches — DORMANT
// unless a Neon API key is configured (see lib/neon-branches.ts). With no
// NEON_API_KEY/NEON_PROJECT_ID configured, this delegates straight to
// scripts/wipe-dev-db.ts, so archiving a workspace behaves EXACTLY as it
// does today (the KEV-186 shared-dev-DB wipe, with its remote-host guard)
// (KEV-187).

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isConfigured, deleteBranch } from "../lib/neon-branches";

function workspaceName(): string {
  return process.env.CONDUCTOR_WORKSPACE_NAME ?? path.basename(process.cwd());
}

/** Runs today's exact keyless behavior: scripts/wipe-dev-db.ts as a subprocess. */
export function runWipeDevDb(): number {
  const result = spawnSync("npx", ["tsx", "scripts/wipe-dev-db.ts"], { stdio: "inherit" });
  return result.status ?? 0;
}

export async function teardownWorkspaceDb(): Promise<number> {
  if (!isConfigured()) {
    console.log(
      "teardown-workspace-db: Neon not configured — delegating to scripts/wipe-dev-db.ts (today's shared dev DB path).",
    );
    return runWipeDevDb();
  }

  const workspace = workspaceName();
  console.log(`teardown-workspace-db: deleting Neon branches for workspace "${workspace}"`);
  const dev = await deleteBranch({ workspace, kind: "dev" });
  const test = await deleteBranch({ workspace, kind: "test" });
  console.log(
    `teardown-workspace-db: done (dev branch deleted=${dev.deleted}, test branch deleted=${test.deleted}).`,
  );
  return 0;
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  teardownWorkspaceDb()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error("teardown-workspace-db failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
