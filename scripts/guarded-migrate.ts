#!/usr/bin/env tsx
// Blocking preflight guard in front of `drizzle-kit migrate`. Refuses to run
// migrations against a remote (non-localhost) database unless
// DB_TARGET_CONFIRM_HOST is explicitly set to the resolved host — see
// lib/db-target.ts. This exists because every workspace's .env.local points
// at the same shared dev database by default (KEV-186); an unguarded
// `drizzle-kit migrate` would silently run against it with no confirmation.
//
// Usage:
//   tsx scripts/guarded-migrate.ts [envFile] [--auto-confirm]
//
// envFile defaults to ".env.local". --auto-confirm pre-confirms the resolved
// host without requiring DB_TARGET_CONFIRM_HOST to already be set — used by
// `db:migrate:test`, which targets the dedicated, disposable test database
// and doesn't need a manual confirmation step every time.
//
// NOT used by the Vercel build — that calls `drizzle-kit migrate` directly
// (see vercel.json), bypassing this wrapper entirely and intentionally.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadDbTargetEnv, resolveDbTarget, checkDbTargetGuard, confirmCommandFor } from "../lib/db-target";

const args = process.argv.slice(2);
const autoConfirm = args.includes("--auto-confirm");
const envFile = args.find((arg) => !arg.startsWith("--")) ?? ".env.local";

// Clears DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING / DATABASE_URL
// before loading envFile, so a stray ambient var the file doesn't define
// (e.g. a leaked DATABASE_URL_UNPOOLED from a workspace shell pointing at a
// different database) can't survive and win via resolution order — see
// lib/db-target.ts's loadDbTargetEnv() and KEV-186.
loadDbTargetEnv(envFile);

function main() {
  const target = resolveDbTarget();
  console.log(`db:migrate target -> host: ${target.host}, database: ${target.database}`);

  if (autoConfirm) {
    process.env.DB_TARGET_CONFIRM_HOST = target.host;
  }

  const result = checkDbTargetGuard(target);
  if (!result.allowed) {
    console.error(
      `\nRefusing to run migrations against a remote database (${target.host}) without confirmation.\n` +
        `If this is intentional, re-run with:\n\n  ${confirmCommandFor(target, "db:migrate")}\n`,
    );
    process.exit(1);
  }

  const drizzleKitBin = path.join(process.cwd(), "node_modules", ".bin", "drizzle-kit");
  // drizzle-kit re-requires drizzle.config.ts in the child process, which does
  // its own dotenv load — DRIZZLE_ENV_FILE tells it to load the same envFile
  // we just guarded against, instead of silently reloading .env.local.
  const proc = spawnSync(drizzleKitBin, ["migrate"], {
    stdio: "inherit",
    env: { ...process.env, DRIZZLE_ENV_FILE: envFile },
  });
  process.exit(proc.status ?? 1);
}

main();
