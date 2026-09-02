// Resolves and guards the database target that migration/wipe scripts operate
// against, so a stray or shared `.env.local` can't silently point a destructive
// command at a remote database.
//
// Resolution order intentionally mirrors drizzle.config.ts's dbCredentials.url
// (DATABASE_URL_UNPOOLED -> POSTGRES_URL_NON_POOLING -> DATABASE_URL) so the
// guard can never drift from what drizzle-kit actually connects to. Callers are
// responsible for loading the right env file (with `override: true`, see
// KEV-186) *before* calling into this module — it only reads process.env.

import { config } from "dotenv";
import { requireEnv } from "./env";

export interface DbTarget {
  url: string;
  host: string;
  database: string;
  isLocal: boolean;
}

// WHATWG URL.hostname keeps the brackets around IPv6 literals (e.g. "[::1]"),
// so both forms are listed here.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// The env vars resolveDbTargetUrl() reads, in preference order.
const RESOLUTION_KEYS = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL"] as const;

/** Resolves the exact connection string the guarded command will use. */
export function resolveDbTargetUrl(): string {
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? requireEnv("DATABASE_URL");
}

/**
 * Loads `envFile` as the SOLE source of truth for DB target resolution.
 *
 * dotenv's `override: true` only overrides keys the file actually defines —
 * if a stray ambient var (e.g. a leaked DATABASE_URL_UNPOOLED from a workspace
 * shell) is set for a key the file doesn't mention, it survives untouched and
 * can win via resolveDbTargetUrl()'s preference order even though the file
 * never intended it. This clears all three resolution keys first, so only
 * what `envFile` actually sets can end up in play.
 *
 * Local-only: used by scripts/guarded-migrate.ts. Do NOT use this in
 * drizzle.config.ts — on Vercel there is no env file to load, and the DB
 * connection comes entirely from injected env vars, which this would wipe.
 */
export function loadDbTargetEnv(envFile: string): void {
  for (const key of RESOLUTION_KEYS) {
    delete process.env[key];
  }
  config({ path: envFile, override: true });
}

/** Parses a connection string into the pieces the guard reasons about. */
export function parseDbTarget(url: string): DbTarget {
  const parsed = new URL(url);
  return {
    url,
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ""),
    isLocal: LOCAL_HOSTS.has(parsed.hostname),
  };
}

/** Resolves + parses the current target in one step. */
export function resolveDbTarget(): DbTarget {
  return parseDbTarget(resolveDbTargetUrl());
}

export type DbTargetGuardResult = { allowed: true; target: DbTarget } | { allowed: false; target: DbTarget };

/**
 * Local targets are always allowed. Remote targets are refused unless
 * `confirmHost` (by default, the DB_TARGET_CONFIRM_HOST env var) matches the
 * resolved host exactly.
 */
export function checkDbTargetGuard(
  target: DbTarget = resolveDbTarget(),
  confirmHost: string | undefined = process.env.DB_TARGET_CONFIRM_HOST,
): DbTargetGuardResult {
  if (target.isLocal) {
    return { allowed: true, target };
  }
  if (confirmHost !== undefined && confirmHost === target.host) {
    return { allowed: true, target };
  }
  return { allowed: false, target };
}

/** The exact command a user should run to confirm and proceed. */
export function confirmCommandFor(target: DbTarget, npmScript: string): string {
  return `DB_TARGET_CONFIRM_HOST=${target.host} npm run ${npmScript}`;
}
