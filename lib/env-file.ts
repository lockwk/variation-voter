// Small helper for rewriting a `.env*` file's known keys in place while
// leaving every other line untouched. Used by scripts/provision-workspace-db.ts
// (KEV-187) to point a workspace's .env.local / .env.test.local at its own
// per-workspace Neon branch without disturbing hand-set values like
// ADMIN_TOKEN or CRON_SECRET.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Sets `key=value` in `contents`: replaces the existing `key=...` line if
 * present (preserving its position and every other line), otherwise appends
 * a new line at the end.
 */
export function upsertEnvVar(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(contents)) {
    return contents.replace(pattern, () => line);
  }

  if (contents.length === 0) {
    return `${line}\n`;
  }

  const withTrailingNewline = contents.endsWith("\n") ? contents : `${contents}\n`;
  return `${withTrailingNewline}${line}\n`;
}

/**
 * Applies `updates` (key -> value) to the env file at `filePath`, creating it
 * if it doesn't exist yet. Only the given keys are touched; every other line
 * is preserved as-is.
 */
export function writeEnvUpdates(filePath: string, updates: Record<string, string>): void {
  let contents = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    contents = upsertEnvVar(contents, key, value);
  }
  writeFileSync(filePath, contents);
}
