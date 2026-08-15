#!/usr/bin/env node
// pipeline/publish-voter.ts
//
// Deterministic glue for the agent-driven variation pipeline (see
// .claude/skills/build-variation-voter/SKILL.md). Reads a manifest of
// { voter, variations[] }, validates each variation's built dist/ directory,
// creates a voter, and uploads each valid dist as an "app" variation.
//
// Usage: tsx pipeline/publish-voter.ts <manifest.json>
//
// Manifest shape:
// {
//   "voter": { "title": "string", "description": "string?" },
//   "variations": [
//     { "title": "string", "description": "string?", "distDir": "path" }
//   ]
// }

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { zipSync } from "fflate";
import { createVoterRequest, addAppRequest } from "../cli/api-client";
import { readDirToMap } from "../cli/read-dir-to-map";

const HELP = `Usage: tsx pipeline/publish-voter.ts <manifest.json>

Reads a manifest of { voter, variations[] }, validates each variation's
built dist/ directory (must contain a root index.html), creates a voter,
and uploads each valid dist as an "app" variation. Requires at least 2
valid variations — refuses to create a voter otherwise.

Manifest shape:
  {
    "voter": { "title": "string", "description": "string?" },
    "variations": [
      { "title": "string", "description": "string?", "distDir": "path" }
    ]
  }

Requires VARIATION_VOTER_URL and VARIATION_VOTER_ADMIN_TOKEN in the
environment (see cli/config.ts).
`;

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

const manifestSchema = z.object({
  voter: z.object({
    title: z.string().trim().min(1, "voter.title is required"),
    description: z.string().trim().min(1).optional(),
  }),
  variations: z
    .array(
      z.object({
        title: z.string().trim().min(1, "variations[].title is required"),
        description: z.string().trim().min(1).optional(),
        distDir: z.string().trim().min(1, "variations[].distDir is required"),
      })
    )
    .min(1, "variations must contain at least one entry"),
});

export type VoterManifest = z.infer<typeof manifestSchema>;
export type ManifestVariation = VoterManifest["variations"][number];

/**
 * Parses + validates a raw (already `JSON.parse`d) manifest value. Throws an
 * `Error` with a readable message on any shape mismatch.
 */
export function parseManifest(raw: unknown): VoterManifest {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`Invalid manifest:\n  ${issues.join("\n  ")}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// distDir validation
// ---------------------------------------------------------------------------

export interface ResolvedVariation {
  title: string;
  description?: string;
  /** Absolute path, resolved against `cwd`. */
  distDir: string;
}

export interface ResolveResult {
  valid: ResolvedVariation[];
  warnings: string[];
}

/**
 * Resolves each variation's `distDir` against `cwd` and keeps only the ones
 * that contain a root `index.html`. Pure aside from the `existsSync` disk
 * check, so it's cheap to exercise in tests against real temp directories.
 */
export function resolveValidVariations(manifest: VoterManifest, cwd: string = process.cwd()): ResolveResult {
  const valid: ResolvedVariation[] = [];
  const warnings: string[] = [];

  for (const variation of manifest.variations) {
    const absoluteDistDir = path.resolve(cwd, variation.distDir);
    const indexHtmlPath = path.join(absoluteDistDir, "index.html");
    if (!existsSync(indexHtmlPath)) {
      warnings.push(`Skipping "${variation.title}" — no index.html found at ${indexHtmlPath}`);
      continue;
    }
    valid.push({ title: variation.title, description: variation.description, distDir: absoluteDistDir });
  }

  return { valid, warnings };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

const MIN_VALID_VARIATIONS = 2;

export interface CreateVoterResult {
  voter: { id: string };
  shareUrl: string;
}

export interface AddAppResult {
  variation: { id: string };
}

export interface PublishDeps {
  createVoter: (input: { title: string; description?: string }) => Promise<CreateVoterResult>;
  addApp: (voterId: string, variation: ResolvedVariation) => Promise<AddAppResult>;
  /** cwd to resolve manifest `distDir` entries against. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Sink for skip/failure warnings. Defaults to `console.warn`. */
  onWarning?: (message: string) => void;
}

export interface PublishedVariation {
  id: string;
  title: string;
}

export interface FailedVariation {
  title: string;
  error: string;
}

export interface PublishResult {
  voterId: string;
  shareUrl: string;
  uploaded: PublishedVariation[];
  failed: FailedVariation[];
}

/**
 * Core publish flow: validate -> create voter -> upload each valid dist in
 * manifest order. `deps` carries the HTTP-hitting functions so this stays
 * unit-testable without a real server/DB (see publish-voter.test.ts).
 *
 * Throws (without creating a voter) if fewer than `MIN_VALID_VARIATIONS`
 * variations have a valid dist. Also throws if, after uploads, fewer than
 * `MIN_VALID_VARIATIONS` succeeded — even though the voter was already
 * created in that case (its id is included in the error message).
 */
export async function publishVoter(manifest: VoterManifest, deps: PublishDeps): Promise<PublishResult> {
  const warn = deps.onWarning ?? ((message: string) => console.warn(`WARN: ${message}`));
  const { valid, warnings } = resolveValidVariations(manifest, deps.cwd);
  for (const message of warnings) warn(message);

  if (valid.length < MIN_VALID_VARIATIONS) {
    throw new Error(
      `Only ${valid.length} valid variation(s) found (need at least ${MIN_VALID_VARIATIONS}). ` +
        `Aborting — no voter was created.`
    );
  }

  const created = await deps.createVoter({
    title: manifest.voter.title,
    description: manifest.voter.description,
  });

  const uploaded: PublishedVariation[] = [];
  const failed: FailedVariation[] = [];

  for (const variation of valid) {
    try {
      const result = await deps.addApp(created.voter.id, variation);
      uploaded.push({ id: result.variation.id, title: variation.title });
    } catch (err) {
      failed.push({ title: variation.title, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (uploaded.length < MIN_VALID_VARIATIONS) {
    throw new Error(
      `Only ${uploaded.length} of ${valid.length} variation(s) uploaded successfully ` +
        `(need at least ${MIN_VALID_VARIATIONS}). Voter ${created.voter.id} was already created ` +
        `but is incomplete — see failures above.`
    );
  }

  return { voterId: created.voter.id, shareUrl: created.shareUrl, uploaded, failed };
}

// ---------------------------------------------------------------------------
// Real deps (HTTP) + CLI entry
// ---------------------------------------------------------------------------

async function realAddApp(voterId: string, variation: ResolvedVariation): Promise<AddAppResult> {
  const fileMap = await readDirToMap(variation.distDir);
  const zipInput: Record<string, Uint8Array> = {};
  for (const [relativePath, data] of fileMap) zipInput[relativePath] = data;
  const zipBytes = zipSync(zipInput);
  return addAppRequest(voterId, { title: variation.title, description: variation.description, zipBytes });
}

async function main() {
  const manifestArg = process.argv[2];

  if (!manifestArg || manifestArg === "--help" || manifestArg === "-h") {
    console.log(HELP);
    process.exit(manifestArg ? 0 : 1);
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (err) {
    console.error(`Error: could not read/parse manifest at ${manifestPath}: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  let manifest: VoterManifest;
  try {
    manifest = parseManifest(raw);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await publishVoter(manifest, {
      createVoter: createVoterRequest,
      addApp: realAddApp,
    });

    console.log("");
    console.log("Uploaded variations:");
    for (const item of result.uploaded) {
      console.log(`  ${item.id}  ${item.title}`);
    }
    if (result.failed.length > 0) {
      console.log("");
      console.log("Failed to upload:");
      for (const item of result.failed) {
        console.log(`  ${item.title}: ${item.error}`);
      }
    }
    console.log("");
    console.log(result.shareUrl);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
